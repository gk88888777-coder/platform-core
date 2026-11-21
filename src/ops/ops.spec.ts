import { randomInt, randomUUID } from 'crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { IdentityModule } from '../identity/identity.module';
import { User } from '../identity/user.entity';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { OpsModule } from './ops.module';
import { OpsService } from './ops.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Confirmation calls (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let orders: OrdersService;
  let ops: OpsService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        IdentityModule,
        CatalogModule,
        DispatchModule,
        OrdersModule,
        OpsModule,
      ],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    orders = moduleRef.get(OrdersService);
    ops = moduleRef.get(OpsService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const admin = randomUUID();

  const place = async (customerId: string, phone = '9876543210') => {
    const store = await catalog.createStore({ name: 'Ops Mart' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 20,
    });
    return orders.create(
      {
        customerName: 'Ops Customer',
        customerPhone: phone,
        deliveryAddress: 'House 1, Test Road, Goa',
        storeId: store.id,
        items: [{ productId: product.id, qty: 1 }],
      },
      undefined,
      customerId,
    );
  };

  const find = async (orderId: string) =>
    (await ops.listPendingCalls(2000)).find((r) => r.orderId === orderId);

  it('lists a new customer with an unverified phone, with the phone to call', async () => {
    const order = await place(randomUUID());
    const row = await find(order.id);
    expect(row).toBeDefined();
    expect(row?.customerPhone).toBe('9876543210');
    expect(row?.attempts).toBe(0);
    expect(row?.lastOutcome).toBeNull();
  });

  it('keeps the order listed after "no answer" and counts the tries', async () => {
    const order = await place(randomUUID());
    await ops.recordResult(order.id, admin, 'NO_ANSWER');
    const second = await ops.recordResult(order.id, admin, 'NO_ANSWER', 'try later');
    expect(second.attempts).toBe(2);

    const row = await find(order.id);
    expect(row?.attempts).toBe(2);
    expect(row?.lastOutcome).toBe('NO_ANSWER');
  });

  it('removes the order from the list once the call is confirmed', async () => {
    const order = await place(randomUUID());
    await ops.recordResult(order.id, admin, 'NO_ANSWER');
    await ops.recordResult(order.id, admin, 'CONFIRMED');
    expect(await find(order.id)).toBeUndefined();
  });

  it('keeps a denied order listed so that an admin can cancel it', async () => {
    const order = await place(randomUUID());
    await ops.recordResult(order.id, admin, 'DENIED');
    const row = await find(order.id);
    expect(row?.lastOutcome).toBe('DENIED');
  });

  it('reports an unknown order', async () => {
    await expect(
      ops.recordResult(randomUUID(), admin, 'CONFIRMED'),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not list an order whose phone was verified by OTP login', async () => {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        phone: `+91${randomInt(6000000000, 9999999999)}`,
        role: 'CUSTOMER',
      }),
    );
    const order = await place(user.id, user.phone as string);
    expect(await find(order.id)).toBeUndefined();
  });
});
