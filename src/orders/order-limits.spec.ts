import { randomInt, randomUUID } from 'crypto';
import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { IdentityModule } from '../identity/identity.module';
import { User } from '../identity/user.entity';
import { OrderAdminService } from './order-admin.service';
import { OrderStatusService } from './order-status.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('New-customer order limits (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let adminList: OrderAdminService;

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
    adminList = moduleRef.get(OrderAdminService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const shop = async (pricePaise: number, stock = 20) => {
    const store = await catalog.createStore({ name: 'Limits Mart' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise,
      stockQty: stock,
    });
    return { store, product };
  };
  type Shop = Awaited<ReturnType<typeof shop>>;

  const place = (s: Shop, customerId: string, phone = '9876543210') =>
    orders.create(
      {
        customerName: 'Test User',
        customerPhone: phone,
        deliveryAddress: 'House 1, Test Road, Goa',
        storeId: s.store.id,
        items: [{ productId: s.product.id, qty: 1 }],
      },
      undefined,
      customerId,
    );

  const stockOf = async (s: Shop) =>
    (await catalog.listProducts(s.store.id)).find((p) => p.id === s.product.id)
      ?.stockQty;

  // पूरा सफ़र चलाए बिना सीधे DELIVERED करो (सिर्फ़ टेस्ट के अस्थायी Database में)
  const markDelivered = (orderId: string) =>
    dataSource.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [
      orderId,
    ]);

  it('allows only one open order for a new customer', async () => {
    const s = await shop(5000);
    const customer = randomUUID();
    const first = await place(s, customer);

    await expect(place(s, customer)).rejects.toThrow(ConflictException);
    expect(await stockOf(s)).toBe(19);

    await status.cancel(first.id, 'test');
    await expect(place(s, customer)).resolves.toBeDefined();
  });

  it('limits the order value for a new customer and gives the stock back', async () => {
    const big = await shop(60000, 5);
    await expect(place(big, randomUUID())).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(await stockOf(big)).toBe(5);

    const small = await shop(40000, 5);
    await expect(place(small, randomUUID())).resolves.toBeDefined();
  });

  it('lifts the limits after three delivered orders', async () => {
    const s = await shop(5000, 50);
    const customer = randomUUID();
    for (let i = 0; i < 3; i += 1) {
      const delivered = await place(s, customer);
      await markDelivered(delivered.id);
    }

    const big = await shop(60000, 5);
    await expect(place(big, customer)).resolves.toBeDefined();
    await expect(place(s, customer)).resolves.toBeDefined();
    await expect(place(s, customer)).resolves.toBeDefined();
    await expect(place(s, customer)).rejects.toThrow(ConflictException);
  });

  it('flags a new customer with an unverified phone for a confirmation call', async () => {
    const s = await shop(5000);
    const order = await place(s, randomUUID());

    const full = await orders.getForAdmin(order.id);
    expect(full.customerPhoneVerified).toBe(false);
    expect(full.needsConfirmationCall).toBe(true);

    const row = (await adminList.list('CREATED', 200)).find(
      (o) => o.id === order.id,
    );
    expect(row?.needsConfirmationCall).toBe(true);
  });

  it('trusts the phone that was verified by OTP login', async () => {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        phone: `+91${randomInt(6000000000, 9999999999)}`,
        role: 'CUSTOMER',
      }),
    );
    const s = await shop(5000);
    const order = await place(s, user.id, user.phone as string);

    const full = await orders.getForAdmin(order.id);
    expect(full.customerPhoneVerified).toBe(true);
    expect(full.needsConfirmationCall).toBe(false);
  });

  it('does not trust a different phone number than the account phone', async () => {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        phone: `+91${randomInt(6000000000, 9999999999)}`,
        role: 'CUSTOMER',
      }),
    );
    const s = await shop(5000);
    const order = await place(s, user.id, '9000000000');

    const full = await orders.getForAdmin(order.id);
    expect(full.customerPhoneVerified).toBe(false);
    expect(full.needsConfirmationCall).toBe(true);
  });

  it('keeps the limit even when two orders arrive at the same moment', async () => {
    const s = await shop(5000, 10);
    const customer = randomUUID();

    const results = await Promise.allSettled([
      place(s, customer),
      place(s, customer),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
      ConflictException,
    );
    expect(await stockOf(s)).toBe(9);
  });
});
