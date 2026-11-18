import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { OrderStatusService } from './order-status.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('OrderStatusService (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let catalog: CatalogService;
  let orders: OrdersService;
  let status: OrderStatusService;

  const customer = {
    customerName: 'Test User',
    customerPhone: '9876543210',
    deliveryAddress: 'House 1, Test Road, Goa',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        CatalogModule,
        OrdersModule,
      ],
    }).compile();
    catalog = moduleRef.get(CatalogService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // नई दुकान, उसमें 10 सामान, और उसका 2 का Order
  const setup = async (name: string) => {
    const store = await catalog.createStore({ name });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 10,
    });
    const order = await orders.create({
      ...customer,
      storeId: store.id,
      items: [{ productId: product.id, qty: 2 }],
    });
    const stock = async () =>
      (await catalog.listProducts(store.id)).find((p) => p.id === product.id)
        ?.stockQty;
    return { order, stock };
  };

  it('moves an order through the full journey', async () => {
    const { order } = await setup('Status Mart 1');
    expect((await status.advance(order.id, 'accept')).status).toBe('ACCEPTED');
    expect((await status.advance(order.id, 'pack')).status).toBe('PACKED');
    expect((await status.advance(order.id, 'dispatch')).status).toBe(
      'OUT_FOR_DELIVERY',
    );
    expect((await status.advance(order.id, 'deliver')).status).toBe('DELIVERED');
  });

  it('does not allow skipping a step', async () => {
    const { order } = await setup('Status Mart 2');
    await expect(status.advance(order.id, 'pack')).rejects.toThrow(
      ConflictException,
    );
  });

  it('gives the stock back when an order is cancelled', async () => {
    const { order, stock } = await setup('Status Mart 3');
    expect(await stock()).toBe(8);
    await status.cancel(order.id, 'customer changed mind');
    expect(await stock()).toBe(10);
  });

  it('does not give the stock back twice on a repeated cancel', async () => {
    const { order, stock } = await setup('Status Mart 4');
    await status.cancel(order.id, 'first');
    await expect(status.cancel(order.id, 'second')).rejects.toThrow(
      ConflictException,
    );
    expect(await stock()).toBe(10);
  });

  it('does not allow cancelling after it is out for delivery', async () => {
    const { order, stock } = await setup('Status Mart 5');
    await status.advance(order.id, 'accept');
    await status.advance(order.id, 'pack');
    await status.advance(order.id, 'dispatch');
    await expect(status.cancel(order.id, 'too late')).rejects.toThrow(
      ConflictException,
    );
    expect(await stock()).toBe(8);
  });

  it('reports an unknown order', async () => {
    await expect(
      status.advance('11111111-1111-4111-8111-111111111111', 'accept'),
    ).rejects.toThrow(NotFoundException);
  });
});
