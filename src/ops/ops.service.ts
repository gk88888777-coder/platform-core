import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../orders/order.entity';
import { CallOutcome, OrderOps } from './order-ops.entity';

// टीम को कॉल करना है, इसलिए यहाँ नाम और फ़ोन दिखता है (पता नहीं)। सिर्फ़ ADMIN के लिए।
export interface PendingCall {
  orderId: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  totalPaise: number;
  status: string;
  createdAt: Date;
  attempts: number;
  lastOutcome: CallOutcome | null;
}

export interface CallResultView {
  orderId: string;
  outcome: CallOutcome;
  attempts: number;
}

@Injectable()
export class OpsService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderOps) private readonly ops: Repository<OrderOps>,
  ) {}

  // जिन Orders पर कॉल बाक़ी है: नया ग्राहक और असत्यापित फ़ोन, और अभी "पुष्टि" दर्ज नहीं।
  // "मना किया" (DENIED) वाले भी सूची में रहते हैं, ताकि Admin उन्हें रद्द करे।
  listPendingCalls(limit: number): Promise<PendingCall[]> {
    return this.orders.query(
      `SELECT o.id AS "orderId", o."storeId", o."customerName", o."customerPhone",
              o."totalPaise", o.status, o."createdAt",
              COALESCE(p.attempts, 0) AS attempts, p."callOutcome" AS "lastOutcome"
         FROM orders o
         LEFT JOIN order_ops p ON p."orderId" = o.id
        WHERE o."needsConfirmationCall" = true
          AND o.status IN ('CREATED','ACCEPTED','PACKED')
          AND (p."callOutcome" IS NULL OR p."callOutcome" <> 'CONFIRMED')
        ORDER BY o."createdAt" ASC
        LIMIT $1`,
      [limit],
    );
  }

  async recordResult(
    orderId: string,
    adminUserId: string,
    outcome: CallOutcome,
    note?: string,
  ): Promise<CallResultView> {
    const exists = await this.orders.count({ where: { id: orderId } });
    if (exists === 0) {
      throw new NotFoundException('Order not found');
    }
    // एक ही कमांड में नया या अपडेट: दो Admin एक साथ दर्ज करें तब भी गड़बड़ नहीं
    await this.ops.query(
      `INSERT INTO order_ops ("orderId","callOutcome","calledByUserId","note","attempts")
       VALUES ($1,$2,$3,$4,1)
       ON CONFLICT ("orderId") DO UPDATE SET
         "callOutcome" = EXCLUDED."callOutcome",
         "calledByUserId" = EXCLUDED."calledByUserId",
         "note" = EXCLUDED."note",
         "attempts" = order_ops."attempts" + 1,
         "updatedAt" = now()`,
      [orderId, outcome, adminUserId, note ?? null],
    );
    const row = await this.ops.findOneByOrFail({ orderId });
    return { orderId, outcome: row.callOutcome, attempts: row.attempts };
  }
}
