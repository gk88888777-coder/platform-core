import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { OrderStatusService } from '../orders/order-status.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { DispatchModule } from './dispatch.module';
import { DispatchService } from './dispatch.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('DispatchService (integration)', () => {
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
        OrdersModule,
        DispatchModule,
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

  // पिछले टेस्टों के बचे Partners से टकराव न हो, इसलिए सबको ऑफ़लाइन कर दो
  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
  });

  // स्वीकृत Order बनाओ
  const acceptedOrder = async (name: string) => {
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
      items: [{ productId: product.id, qty: 1 }],
    });
    await status.advance(order.id, 'accept');
    return order;
  };

  // सत्यापित और ऑनलाइन Partner बनाओ
  const readyPartner = async (name: string) => {
    const partner = await dispatch.createPartner(name, '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.setOnline(partner.id, true);
    return partner;
  };

  it('assigns an accepted order to an online, verified partner', async () => {
    const partner = await readyPartner('P1');
    const order = await acceptedOrder('Dispatch Mart 1');
    const result = await dispatch.assign(order.id);
    expect(result.partnerId).toBe(partner.id);
    expect(result.status).toBe('OFFERED');
  });

  it('does not assign to an unverified partner', async () => {
    const partner = await dispatch.createPartner('Unverified', '9000000001');
    await dispatch.setOnline(partner.id, true);
    const order = await acceptedOrder('Dispatch Mart 2');
    await expect(dispatch.assign(order.id)).rejects.toThrow(ConflictException);
  });

  it('does not assign an order that is not accepted yet', async () => {
    await readyPartner('P3');
    const store = await catalog.createStore({ name: 'Dispatch Mart 3' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 10,
    });
    const order = await orders.create({
      ...customer,
      storeId: store.id,
      items: [{ productId: product.id, qty: 1 }],
    });
    await expect(dispatch.assign(order.id)).rejects.toThrow(ConflictException);
  });

  it('does not assign the same order twice', async () => {
    await readyPartner('P4a');
    await readyPartner('P4b');
    const order = await acceptedOrder('Dispatch Mart 4');
    await dispatch.assign(order.id);
    await expect(dispatch.assign(order.id)).rejects.toThrow(ConflictException);
  });

  it('gives a rejected order to the next partner, not the same one', async () => {
    const first = await readyPartner('P5a');
    const second = await readyPartner('P5b');
    const order = await acceptedOrder('Dispatch Mart 5');

    const offer1 = await dispatch.assign(order.id);
    expect(offer1.partnerId).toBe(first.id);
    await dispatch.reject(offer1.id);

    const offer2 = await dispatch.assign(order.id);
    expect(offer2.partnerId).toBe(second.id);
  });

  it('cannot respond to the same offer twice', async () => {
    await readyPartner('P6');
    const order = await acceptedOrder('Dispatch Mart 6');
    const offer = await dispatch.assign(order.id);
    await dispatch.accept(offer.id);
    await expect(dispatch.reject(offer.id)).rejects.toThrow(ConflictException);
  });
});
