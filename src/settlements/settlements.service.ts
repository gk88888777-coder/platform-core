import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreAccessService } from '../catalog/store-access.service';
import { Assignment } from '../dispatch/assignment.entity';
import { Partner } from '../dispatch/partner.entity';
import { PaymentsService } from '../payments/payments.service';

export interface PartnerSummary {
  cashInHandPaise: number;
  earningsPayablePaise: number;
  deliveriesCompleted: number;
}

export interface MerchantSummary {
  stores: { storeId: string; payablePaise: number }[];
  totalPayablePaise: number;
}

export interface DailyReport {
  date: string;
  orders: number;
  grossPaise: number;
  deliveryFeesPaise: number;
  commissionPaise: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SettlementsService {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stores: StoreAccessService,
    @InjectRepository(Partner) private readonly partners: Repository<Partner>,
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
  ) {}

  // Partner ख़ुद अपना हिसाब देखे
  async partnerSummary(userId: string): Promise<PartnerSummary> {
    const partner = await this.partners.findOneBy({ userId });
    if (!partner) {
      throw new ForbiddenException(
        'No delivery partner profile is linked to this account',
      );
    }
    return {
      cashInHandPaise: await this.payments.cashWithPartner(partner.id),
      earningsPayablePaise: await this.payments.partnerPayable(partner.id),
      deliveriesCompleted: await this.assignments.countBy({
        partnerId: partner.id,
        status: 'COMPLETED',
      }),
    };
  }

  // दुकानदार ख़ुद अपनी दुकानों का बकाया देखे
  async merchantSummary(userId: string): Promise<MerchantSummary> {
    const storeIds = await this.stores.storeIdsOwnedBy(userId);
    const stores: MerchantSummary['stores'] = [];
    for (const storeId of storeIds) {
      stores.push({
        storeId,
        payablePaise: await this.payments.merchantPayable(storeId),
      });
    }
    return {
      stores,
      totalPayablePaise: stores.reduce((sum, s) => sum + s.payablePaise, 0),
    };
  }

  // भारतीय समय के एक दिन की रिपोर्ट
  async dailyReport(date?: string): Promise<DailyReport> {
    const day =
      date ?? new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
    const start = new Date(`${day}T00:00:00+05:30`);
    const valid =
      !Number.isNaN(start.getTime()) &&
      new Date(start.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) === day;
    if (!valid) {
      throw new BadRequestException('Invalid date');
    }
    const totals = await this.payments.dailyTotals(
      start,
      new Date(start.getTime() + DAY_MS),
    );
    return { date: day, ...totals };
  }
}
