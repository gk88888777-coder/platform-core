import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '../catalog/store.entity';
import { OrderEvents } from '../events/event-types';
import { DomainEvent, EventsService } from '../events/events.service';
import { NotificationsService } from './notifications.service';

interface OrderEventPayload {
  orderId: string;
  storeId: string;
  customerId: string | null;
  totalPaise: number;
}

interface Text {
  type: string;
  title: string;
  body: string;
}

// ग्राहक को जाने वाली सूचनाएँ
const CUSTOMER_TEXT: Record<string, Text> = {
  [OrderEvents.ACCEPTED]: {
    type: 'ORDER_ACCEPTED',
    title: 'Order accepted',
    body: 'The shop has accepted your order.',
  },
  [OrderEvents.PACKED]: {
    type: 'ORDER_PACKED',
    title: 'Order packed',
    body: 'Your order is packed and waiting for a delivery partner.',
  },
  [OrderEvents.OUT_FOR_DELIVERY]: {
    type: 'ORDER_ON_THE_WAY',
    title: 'On the way',
    body: 'Your order is out for delivery.',
  },
  [OrderEvents.DELIVERED]: {
    type: 'ORDER_DELIVERED',
    title: 'Delivered',
    body: 'Your order has been delivered. Thank you!',
  },
  [OrderEvents.CANCELLED]: {
    type: 'ORDER_CANCELLED',
    title: 'Order cancelled',
    body: 'Your order was cancelled.',
  },
};

const rupees = (paise: number): string => (paise / 100).toFixed(2);

@Injectable()
export class NotificationsSubscriber implements OnModuleInit, OnModuleDestroy {
  private unregister: (() => void) | undefined;

  constructor(
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  onModuleInit(): void {
    this.unregister = this.events.register({
      types: [OrderEvents.CREATED, ...Object.keys(CUSTOMER_TEXT)],
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  private async handle(event: DomainEvent): Promise<void> {
    const p = event.payload as unknown as OrderEventPayload;

    if (event.type === OrderEvents.CREATED) {
      // दुकान के मालिक को (सिर्फ़ पढ़ना: Store तालिका Catalog की है)
      const store = await this.stores.findOne({
        where: { id: p.storeId },
        select: { id: true, ownerUserId: true },
      });
      if (store?.ownerUserId) {
        await this.notifications.notify({
          userId: store.ownerUserId,
          type: 'ORDER_RECEIVED',
          title: 'New order',
          body: `A new order of Rs ${rupees(p.totalPaise)} is waiting for you.`,
          orderId: p.orderId,
          eventId: event.id,
        });
      }
      return;
    }

    const text = CUSTOMER_TEXT[event.type];
    if (text && p.customerId) {
      await this.notifications.notify({
        userId: p.customerId,
        ...text,
        orderId: p.orderId,
        eventId: event.id,
      });
    }
  }
}
