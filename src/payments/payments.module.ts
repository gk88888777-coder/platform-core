import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../dispatch/assignment.entity';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { Order } from '../orders/order.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSubscriber } from './payments.subscriber';

// भुगतान-बही: COD का हिसाब, नक़द जमा और भुगतान।
@Module({
  imports: [
    TypeOrmModule.forFeature([LedgerEntry, Order, Assignment]),
    EventsModule,
    IdentityModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsSubscriber],
  exports: [PaymentsService],
})
export class PaymentsModule {}
