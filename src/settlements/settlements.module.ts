import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { Assignment } from '../dispatch/assignment.entity';
import { Partner } from '../dispatch/partner.entity';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { Order } from '../orders/order.entity';
import { PaymentsModule } from '../payments/payments.module';
import { EarningsSubscriber } from './earnings.subscriber';
import {
  MerchantBalanceController,
  PartnerEarningsController,
  ReportsController,
} from './settlements.controller';
import { SettlementsService } from './settlements.service';

// Partner की कमाई, दोनों पक्षों का अपना हिसाब, और Admin की दैनिक रिपोर्ट।
@Module({
  imports: [
    TypeOrmModule.forFeature([Partner, Assignment, Order]),
    CatalogModule,
    EventsModule,
    IdentityModule,
    PaymentsModule,
  ],
  controllers: [
    PartnerEarningsController,
    MerchantBalanceController,
    ReportsController,
  ],
  providers: [SettlementsService, EarningsSubscriber],
})
export class SettlementsModule {}
