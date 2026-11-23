import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { optionalIntSetting } from '../common/settings';
import { Assignment } from '../dispatch/assignment.entity';
import { OrderEvents } from '../events/event-types';
import { DomainEvent, EventsService } from '../events/events.service';
import { Order } from '../orders/order.entity';
import { Accounts, PaymentsService } from '../payments/payments.service';

// हर डिलीवरी पर Partner की कमाई बही में दर्ज होती है।
@Injectable()
export class EarningsSubscriber implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void) | undefined;

  constructor(
    private readonly events: EventsService,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
  ) {}

  onModuleInit(): void {
    this.unregister = this.events.register({
      types: [OrderEvents.DELIVERED],
      handle: (event) => this.onDelivered(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  private async onDelivered(event: DomainEvent): Promise<void> {
    const order = await this.orders.findOne({
      where: { id: event.aggregateId },
      select: { id: true, deliveryFeePaise: true },
    });
    if (!order) {
      throw new Error('Order not found for the delivered event');
    }
    const assignment = await this.assignments.findOne({
      where: { orderId: order.id, status: 'COMPLETED' },
    });
    if (!assignment) {
      throw new Error('No completed delivery partner for the delivered order');
    }

    // Requires Business Decision: प्रति डिलीवरी कमाई। सेटिंग न हो तो उस Order का डिलीवरी शुल्क।
    const payout =
      optionalIntSetting(this.config, 'PARTNER_PAYOUT_PAISE', 0, 1000000) ??
      order.deliveryFeePaise;

    await this.payments.post(
      { kind: 'PARTNER_EARNING', orderId: order.id, eventId: event.id },
      [
        {
          account: Accounts.PLATFORM_PARTNER_COST,
          direction: 'DEBIT',
          amountPaise: payout,
        },
        {
          account: Accounts.partnerPayable(assignment.partnerId),
          direction: 'CREDIT',
          amountPaise: payout,
        },
      ],
    );
  }
}
