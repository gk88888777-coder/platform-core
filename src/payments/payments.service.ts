import { randomUUID } from 'crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Direction } from './ledger-entry.entity';

export interface PostingLine {
  account: string;
  direction: Direction;
  amountPaise: number;
}

export interface PostingContext {
  kind: string;
  orderId?: string;
  eventId?: string;
  actorUserId?: string;
}

export interface BalanceView {
  account: string;
  balancePaise: number;
}

export interface DailyTotals {
  orders: number;
  grossPaise: number;
  deliveryFeesPaise: number;
  commissionPaise: number;
}

// खातों के नाम एक ही जगह: टाइपो से बचाव
export const Accounts = {
  // Partner के पास ग्राहक से लिया नक़द, जो प्लेटफ़ॉर्म को देना है (संपत्ति)
  cashWithPartner: (partnerId: string): string => `CASH_WITH_PARTNER:${partnerId}`,
  // प्लेटफ़ॉर्म पर दुकान का बकाया (देनदारी)
  merchantPayable: (storeId: string): string => `MERCHANT_PAYABLE:${storeId}`,
  // प्लेटफ़ॉर्म पर Partner की कमाई का बकाया (देनदारी)
  partnerPayable: (partnerId: string): string => `PARTNER_PAYABLE:${partnerId}`,
  PLATFORM_CASH: 'PLATFORM_CASH',
  PLATFORM_COMMISSION: 'PLATFORM_COMMISSION',
  PLATFORM_DELIVERY_FEES: 'PLATFORM_DELIVERY_FEES',
  PLATFORM_PARTNER_COST: 'PLATFORM_PARTNER_COST',
} as const;

@Injectable()
export class PaymentsService {
  constructor(private readonly dataSource: DataSource) {}

  // हर लेन-देन में नामे (DEBIT) और जमा (CREDIT) का जोड़ बराबर होना ज़रूरी है।
  // शून्य रक़म की पंक्तियाँ छोड़ दी जाती हैं। सारी पंक्तियाँ एक साथ दर्ज होती हैं या कोई नहीं।
  async post(
    context: PostingContext,
    lines: PostingLine[],
    manager?: EntityManager,
  ): Promise<void> {
    const real = lines.filter((line) => line.amountPaise !== 0);
    for (const line of real) {
      if (!Number.isInteger(line.amountPaise) || line.amountPaise < 0) {
        throw new Error('Posting amounts must be whole paise');
      }
    }
    const sum = (direction: Direction): number =>
      real
        .filter((line) => line.direction === direction)
        .reduce((total, line) => total + line.amountPaise, 0);
    if (real.length < 2 || sum('DEBIT') !== sum('CREDIT')) {
      throw new Error('Unbalanced posting');
    }

    const run = async (em: EntityManager): Promise<void> => {
      const groupId = randomUUID();
      for (const line of real) {
        await em.query(
          `INSERT INTO ledger_entries
             ("id","groupId","eventId","orderId","actorUserId","account","direction","amountPaise","kind")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT ("eventId","account") WHERE "eventId" IS NOT NULL DO NOTHING`,
          [
            randomUUID(),
            groupId,
            context.eventId ?? null,
            context.orderId ?? null,
            context.actorUserId ?? null,
            line.account,
            line.direction,
            line.amountPaise,
            context.kind,
          ],
        );
      }
    };
    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }
  }

  // नामे घटाकर जमा
  private async netDebit(account: string, manager?: EntityManager): Promise<number> {
    const em = manager ?? this.dataSource.manager;
    const rows: { net: string }[] = await em.query(
      `SELECT COALESCE(SUM(CASE WHEN "direction" = 'DEBIT' THEN "amountPaise" ELSE -"amountPaise" END), 0)::bigint AS net
         FROM ledger_entries WHERE "account" = $1`,
      [account],
    );
    return Number(rows[0].net);
  }

  async cashWithPartner(partnerId: string, manager?: EntityManager): Promise<number> {
    return this.netDebit(Accounts.cashWithPartner(partnerId), manager);
  }

  async merchantPayable(storeId: string, manager?: EntityManager): Promise<number> {
    return -(await this.netDebit(Accounts.merchantPayable(storeId), manager));
  }

  async partnerPayable(partnerId: string, manager?: EntityManager): Promise<number> {
    return -(await this.netDebit(Accounts.partnerPayable(partnerId), manager));
  }

  // Admin: Partner से नक़द मिला। Partner के पास जितना नक़द है उससे ज़्यादा दर्ज नहीं हो सकता।
  recordCashDeposit(
    partnerId: string,
    amountPaise: number,
    actorUserId: string,
  ): Promise<BalanceView> {
    const account = Accounts.cashWithPartner(partnerId);
    return this.guarded(account, amountPaise, 'CASH_DEPOSIT', actorUserId, {
      available: (em) => this.cashWithPartner(partnerId, em),
      lines: [
        { account: Accounts.PLATFORM_CASH, direction: 'DEBIT', amountPaise },
        { account, direction: 'CREDIT', amountPaise },
      ],
      after: (em) => this.cashWithPartner(partnerId, em),
    });
  }

  // Admin: दुकान को भुगतान किया। बकाया से ज़्यादा नहीं।
  recordMerchantPayout(
    storeId: string,
    amountPaise: number,
    actorUserId: string,
  ): Promise<BalanceView> {
    const account = Accounts.merchantPayable(storeId);
    return this.guarded(account, amountPaise, 'MERCHANT_PAYOUT', actorUserId, {
      available: (em) => this.merchantPayable(storeId, em),
      lines: [
        { account, direction: 'DEBIT', amountPaise },
        { account: Accounts.PLATFORM_CASH, direction: 'CREDIT', amountPaise },
      ],
      after: (em) => this.merchantPayable(storeId, em),
    });
  }

  // Admin: Partner को कमाई का भुगतान किया। बकाया से ज़्यादा नहीं।
  recordPartnerPayout(
    partnerId: string,
    amountPaise: number,
    actorUserId: string,
  ): Promise<BalanceView> {
    const account = Accounts.partnerPayable(partnerId);
    return this.guarded(account, amountPaise, 'PARTNER_PAYOUT', actorUserId, {
      available: (em) => this.partnerPayable(partnerId, em),
      lines: [
        { account, direction: 'DEBIT', amountPaise },
        { account: Accounts.PLATFORM_CASH, direction: 'CREDIT', amountPaise },
      ],
      after: (em) => this.partnerPayable(partnerId, em),
    });
  }

  // एक दिन (दिए समय-अंतराल) के कुल: डिलीवर हुए Orders, कुल रक़म, डिलीवरी शुल्क और कमीशन
  async dailyTotals(from: Date, to: Date): Promise<DailyTotals> {
    const rows: Record<string, string>[] = await this.dataSource.query(
      `SELECT
         count(DISTINCT "orderId") AS orders,
         COALESCE(SUM("amountPaise") FILTER (WHERE "account" LIKE 'CASH_WITH_PARTNER:%' AND "direction" = 'DEBIT'), 0)::bigint AS gross,
         COALESCE(SUM("amountPaise") FILTER (WHERE "account" = 'PLATFORM_DELIVERY_FEES' AND "direction" = 'CREDIT'), 0)::bigint AS fees,
         COALESCE(SUM("amountPaise") FILTER (WHERE "account" = 'PLATFORM_COMMISSION' AND "direction" = 'CREDIT'), 0)::bigint AS commission
       FROM ledger_entries
       WHERE "kind" = 'COD_DELIVERED' AND "createdAt" >= $1 AND "createdAt" < $2`,
      [from, to],
    );
    const row = rows[0];
    return {
      orders: Number(row.orders),
      grossPaise: Number(row.gross),
      deliveryFeesPaise: Number(row.fees),
      commissionPaise: Number(row.commission),
    };
  }

  // एक खाते पर एक समय में एक ही भुगतान (ताला), बकाया की जाँच, फिर दर्ज करना
  private guarded(
    account: string,
    amountPaise: number,
    kind: string,
    actorUserId: string,
    plan: {
      available: (em: EntityManager) => Promise<number>;
      lines: PostingLine[];
      after: (em: EntityManager) => Promise<number>;
    },
  ): Promise<BalanceView> {
    return this.dataSource.transaction(async (em) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtext($1))', [account]);
      const available = await plan.available(em);
      if (!Number.isInteger(amountPaise) || amountPaise <= 0 || amountPaise > available) {
        throw new ConflictException('Amount is more than the balance');
      }
      await this.post({ kind, actorUserId }, plan.lines, em);
      return { account, balancePaise: await plan.after(em) };
    });
  }
}
