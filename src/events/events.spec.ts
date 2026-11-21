import { randomUUID } from 'crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { IdentityModule } from '../identity/identity.module';
import { OrderStatusService } from '../orders/order-status.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { DomainEvent, EventsService } from './events.service';
import { OutboxEvent } from './outbox-event.entity';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Events outbox and pricing in orders (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let events: EventsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        IdentityModule,
        CatalogModule,
        DispatchModule,
        OrdersModule,
      ],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
    events = moduleRef.get(EventsService);
    // पिछली Test-फ़ाइलों की बची घटनाएँ पहले निपटा दो
    await drain();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // कतार तब तक ख़ाली करो जब तक कुछ निकलना बंद न हो
  const drain = async (): Promise<void> => {
    for (;;) {
      if ((await events.processPending(200)) === 0) {
        return;
      }
    }
  };

  const shop = async (pricePaise: number) => {
    const store = await catalog.createStore({ name: 'Events Mart' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise,
      stockQty: 20,
    });
    return { store, product };
  };
  type Shop = Awaited<ReturnType<typeof shop>>;

  const place = (s: Shop, customerId: string) =>
    orders.create(
      {
        customerName: 'Test User',
        customerPhone: '9876543210',
        deliveryAddress: 'House 1, Test Road, Goa',
        storeId: s.store.id,
        items: [{ productId: s.product.id, qty: 1 }],
      },
      undefined,
      customerId,
    );

  const eventsOf = (aggregateId: string): Promise<OutboxEvent[]> =>
    dataSource
      .getRepository(OutboxEvent)
      .find({ where: { aggregateId }, order: { createdAt: 'ASC' } });

  it('records order.created with the order and no personal details', async () => {
    const s = await shop(5000);
    const order = await place(s, randomUUID());
    const rows = await eventsOf(order.id);

    expect(rows.map((r) => r.type)).toEqual(['order.created']);
    expect(rows[0].payload).toMatchObject({
      orderId: order.id,
      storeId: s.store.id,
    });
    expect(JSON.stringify(rows[0].payload)).not.toContain('9876543210');
    expect(JSON.stringify(rows[0].payload)).not.toContain('Test Road');
  });

  it('delivers each event once to its subscriber', async () => {
    const s = await shop(5000);
    const order = await place(s, randomUUID());

    const received: DomainEvent[] = [];
    const unregister = events.register({
      types: ['order.created'],
      handle: (event) => {
        if (event.aggregateId === order.id) {
          received.push(event);
        }
        return Promise.resolve();
      },
    });
    try {
      await drain();
      await drain();
    } finally {
      unregister();
    }

    expect(received).toHaveLength(1);
    const [row] = await eventsOf(order.id);
    expect(row.processedAt).not.toBeNull();
    expect(row.failed).toBe(false);
  });

  it('records every step of the order, including cancel', async () => {
    const s = await shop(5000);
    const order = await place(s, randomUUID());
    await status.advance(order.id, 'accept');
    await status.advance(order.id, 'pack');
    await status.cancel(order.id, 'test');

    const rows = await eventsOf(order.id);
    expect(rows.map((r) => r.type)).toEqual([
      'order.created',
      'order.accepted',
      'order.packed',
      'order.cancelled',
    ]);
  });

  it('leaves no event behind when the order is refused', async () => {
    const repo = dataSource.getRepository(OutboxEvent);
    const before = await repo.countBy({ type: 'order.created' });

    const big = await shop(60000);
    await expect(place(big, randomUUID())).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(await repo.countBy({ type: 'order.created' })).toBe(before);
  });

  it('retries a failing subscriber and then gives up after five tries', async () => {
    const s = await shop(5000);
    const order = await place(s, randomUUID());

    let calls = 0;
    const unregister = events.register({
      types: ['order.created'],
      handle: () => {
        return Promise.resolve();
      },
    });
    unregister();
    const failing = events.register({
      types: ['order.created'],
      handle: (event) => {
        if (event.aggregateId === order.id) {
          calls += 1;
          return Promise.reject(new Error('boom'));
        }
        return Promise.resolve();
      },
    });
    try {
      for (let i = 0; i < 5; i += 1) {
        await events.processPending(200);
      }
      const [row] = await eventsOf(order.id);
      expect(calls).toBe(5);
      expect(row.attempts).toBe(5);
      expect(row.failed).toBe(true);
      expect(row.processedAt).not.toBeNull();

      await events.processPending(200);
      expect(calls).toBe(5);
    } finally {
      failing();
    }
  });

  it('uses the configured delivery fee for new orders', async () => {
    process.env.DELIVERY_FEE_PAISE = '1500';
    try {
      const s = await shop(5000);
      const order = await place(s, randomUUID());
      expect(order.deliveryFeePaise).toBe(1500);
      expect(order.totalPaise).toBe(6500);
    } finally {
      delete process.env.DELIVERY_FEE_PAISE;
    }
  });
});
