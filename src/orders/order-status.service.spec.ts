import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrderStatusService } from './order-status.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('OrderStatusService (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let dispatch: DispatchService;

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
        DispatchModule,
        OrdersModule,
      ],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
    dispatch = moduleRef.get(DispatchService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // पिछले टेस्टों के बचे Partners से टकराव न हो
  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
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

  // Order को स्वीकार करके, Partner से स्वीकार करवाकर, पैक करके डिलीवरी पर निकालो
  const outForDelivery = async (orderId: string) => {
    await status.advance(orderId, 'accept');
    const partner = await dispatch.createPartner('Status Partner', '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.setOnline(partner.id, true);
    const offer = await dispatch.assign(orderId);
    await dispatch.accept(offer.id);
    await status.advance(orderId, 'pack');
    await status.advance(orderId, 'dispatch');
  };

  it('moves an order through the full journey', async () => {
    const { order } = await setup('Status Mart 1');
    await outForDelivery(order.id);
    expect((await orders.getForAdmin(order.id)).status).toBe(
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

  it('refuses to go out for delivery without an accepted partner', async () => {
    const { order } = await setup('Status Mart 2b');
    await status.advance(order.id, 'accept');
    await status.advance(order.id, 'pack');
    await expect(status.advance(order.id, 'dispatch')).rejects.toThrow(
      ConflictException,
    );
    expect((await orders.getForAdmin(order.id)).status).toBe('PACKED');
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
    await outForDelivery(order.id);
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
