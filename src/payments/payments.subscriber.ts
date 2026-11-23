import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { intSetting } from '../common/settings';
import { Assignment } from '../dispatch/assignment.entity';
import { OrderEvents } from '../events/event-types';
import { DomainEvent, EventsService } from '../events/events.service';
import { Order } from '../orders/order.entity';
import { Accounts, PaymentsService } from './payments.service';

// Order डिलीवर होते ही COD का हिसाब बही में।
// (Order और Assignment तालिकाएँ सिर्फ़ पढ़ी जाती हैं, उनमें कुछ लिखा नहीं जाता।)
@Injectable()
export class PaymentsSubscriber implements OnModuleInit, OnModuleDestroy {
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

  // दोहराव सुरक्षित: बही में (घटना, खाता) अनोखा है, इसलिए घटना दोबारा चले तो कुछ नहीं बदलता
  private async onDelivered(event: DomainEvent): Promise<void> {
    const order = await this.orders.findOne({
      where: { id: event.aggregateId },
      select: {
        id: true,
        storeId: true,
        subtotalPaise: true,
        deliveryFeePaise: true,
        totalPaise: true,
        paymentMethod: true,
      },
    });
    if (!order) {
      throw new Error('Order not found for the delivered event');
    }
    // ऑनलाइन भुगतान आने पर उनके लिए अलग नियम जुड़ेंगे
    if (order.paymentMethod !== 'COD') {
      return;
    }
    const assignment = await this.assignments.findOne({
      where: { orderId: order.id, status: 'COMPLETED' },
    });
    if (!assignment) {
      throw new Error('No completed delivery partner for the delivered order');
    }
    if (order.subtotalPaise + order.deliveryFeePaise !== order.totalPaise) {
      throw new Error('Order amounts do not add up');
    }

    // Requires Business Decision: कमीशन (बेसिस पॉइंट में, 100 = 1%), डिफ़ॉल्ट 0
    const bps = intSetting(this.config, 'COMMISSION_BPS', 0, 0, 5000);
    const commission = Math.floor((order.subtotalPaise * bps) / 10000);

    await this.payments.post(
      { kind: 'COD_DELIVERED', orderId: order.id, eventId: event.id },
      [
        {
          account: Accounts.cashWithPartner(assignment.partnerId),
          direction: 'DEBIT',
          amountPaise: order.totalPaise,
        },
        {
          account: Accounts.merchantPayable(order.storeId),
          direction: 'CREDIT',
          amountPaise: order.subtotalPaise - commission,
        },
        {
          account: Accounts.PLATFORM_COMMISSION,
          direction: 'CREDIT',
          amountPaise: commission,
        },
        {
          account: Accounts.PLATFORM_DELIVERY_FEES,
          direction: 'CREDIT',
          amountPaise: order.deliveryFeePaise,
        },
      ],
    );
  }
}
