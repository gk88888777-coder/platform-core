import { randomInt, randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { StoreAccessService } from '../catalog/store-access.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { EventsService } from '../events/events.service';
import { IdentityModule } from '../identity/identity.module';
import { User } from '../identity/user.entity';
import { OrderStatusService } from '../orders/order-status.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Notifications (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let access: StoreAccessService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let events: EventsService;
  let notifications: NotificationsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        IdentityModule,
        CatalogModule,
        DispatchModule,
        OrdersModule,
        NotificationsModule,
      ],
    }).compile();
    // Subscribers शुरू हों, इसके लिए init ज़रूरी है
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    access = moduleRef.get(StoreAccessService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
    events = moduleRef.get(EventsService);
    notifications = moduleRef.get(NotificationsService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const drain = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) {
      if ((await events.processPending(200)) === 0) {
        return;
      }
    }
  };

  const merchantShop = async () => {
    const users = dataSource.getRepository(User);
    const owner = await users.save(
      users.create({
        phone: `+91${randomInt(6000000000, 9999999999)}`,
        role: 'MERCHANT',
      }),
    );
    const store = await catalog.createStore({ name: 'Notify Mart' });
    await access.linkOwner(store.id, owner.id);
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 20,
    });
    return { owner, store, product };
  };

  const place = (shop: Awaited<ReturnType<typeof merchantShop>>, customerId: string) =>
    orders.create(
      {
        customerName: 'Test User',
        customerPhone: '9876543210',
        deliveryAddress: 'House 1, Test Road, Goa',
        storeId: shop.store.id,
        items: [{ productId: shop.product.id, qty: 1 }],
      },
      undefined,
      customerId,
    );

  it('tells the shop owner about a new order, without personal details', async () => {
    const shop = await merchantShop();
    const order = await place(shop, randomUUID());
    await drain();

    const list = await notifications.list(shop.owner.id, false, 50);
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('ORDER_RECEIVED');
    expect(list[0].orderId).toBe(order.id);
    expect(list[0].read).toBe(false);
    expect(JSON.stringify(list[0])).not.toContain('9876543210');
    expect(JSON.stringify(list[0])).not.toContain('Test Road');
  });

  it('tells the customer about each step', async () => {
    const shop = await merchantShop();
    const customer = randomUUID();
    const order = await place(shop, customer);
    await status.advance(order.id, 'accept');
    await drain();
    await status.cancel(order.id, 'test');
    await drain();

    const types = (await notifications.list(customer, false, 50)).map((n) => n.type);
    expect(types).toHaveLength(2);
    expect(types).toEqual(
      expect.arrayContaining(['ORDER_ACCEPTED', 'ORDER_CANCELLED']),
    );
  });

  it('does not send the same notification twice when an event runs again', async () => {
    const shop = await merchantShop();
    const customer = randomUUID();
    const order = await place(shop, customer);
    await status.advance(order.id, 'accept');
    await drain();
    const before = await notifications.list(customer, false, 50);

    await dataSource.query(
      `UPDATE outbox_events SET "processedAt" = NULL, attempts = 0 WHERE "aggregateId" = $1`,
      [order.id],
    );
    await drain();

    expect(await notifications.list(customer, false, 50)).toHaveLength(before.length);
    expect(await notifications.list(shop.owner.id, false, 50)).toHaveLength(1);
  });

  it('marks notifications as read, one or all', async () => {
    const shop = await merchantShop();
    const customer = randomUUID();
    const order = await place(shop, customer);
    await status.advance(order.id, 'accept');
    await status.advance(order.id, 'pack');
    await drain();

    expect(await notifications.unreadCount(customer)).toBe(2);
    const [first] = await notifications.list(customer, true, 50);
    await notifications.markRead(customer, first.id);
    expect(await notifications.unreadCount(customer)).toBe(1);
    expect(await notifications.markAllRead(customer)).toBe(1);
    expect(await notifications.unreadCount(customer)).toBe(0);
    expect(await notifications.list(customer, true, 50)).toEqual([]);
  });

  it('never lets someone read another person\'s notification', async () => {
    const shop = await merchantShop();
    const customer = randomUUID();
    const order = await place(shop, customer);
    await status.advance(order.id, 'accept');
    await drain();

    const [mine] = await notifications.list(customer, false, 50);
    await expect(notifications.markRead(randomUUID(), mine.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(await notifications.list(randomUUID(), false, 50)).toEqual([]);
  });
});
