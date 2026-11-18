import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrderAdminService } from './order-admin.service';
import { OrderStatusService } from './order-status.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Order and Dispatch link (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let dispatch: DispatchService;
  let adminList: OrderAdminService;

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
    adminList = moduleRef.get(OrderAdminService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // पिछले टेस्टों के बचे Partners से टकराव न हो
  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
  });

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

  const readyPartner = async (name: string) => {
    const partner = await dispatch.createPartner(name, '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.setOnline(partner.id, true);
    return partner;
  };

  it('frees the partner when the order is delivered', async () => {
    const partner = await readyPartner('Link P1');
    const first = await acceptedOrder('Link Mart 1');
    const offer = await dispatch.assign(first.id);
    await dispatch.accept(offer.id);
    await status.advance(first.id, 'pack');
    await status.advance(first.id, 'dispatch');
    await status.advance(first.id, 'deliver');

    const second = await acceptedOrder('Link Mart 2');
    const next = await dispatch.assign(second.id);
    expect(next.partnerId).toBe(partner.id);
  });

  it('frees the partner when the order is cancelled', async () => {
    const partner = await readyPartner('Link P2');
    const first = await acceptedOrder('Link Mart 3');
    await dispatch.assign(first.id);
    await status.cancel(first.id, 'customer changed mind');

    const second = await acceptedOrder('Link Mart 4');
    const next = await dispatch.assign(second.id);
    expect(next.partnerId).toBe(partner.id);
  });

  it('does not let a partner accept the offer of a cancelled order', async () => {
    await readyPartner('Link P3');
    const order = await acceptedOrder('Link Mart 5');
    const offer = await dispatch.assign(order.id);
    await status.cancel(order.id, 'out of stock');
    await expect(dispatch.accept(offer.id)).rejects.toThrow(ConflictException);
  });

  it('lists orders by status without personal details', async () => {
    const order = await acceptedOrder('Link Mart 6');
    const list = await adminList.list('ACCEPTED', 100);
    const found = list.find((o) => o.id === order.id);
    expect(found).toBeDefined();
    expect(Object.keys(found as object)).not.toContain('customerPhone');
    expect(Object.keys(found as object)).not.toContain('deliveryAddress');
  });

  it('lists available partners without phone numbers', async () => {
    const partner = await readyPartner('Link P5');
    const before = await dispatch.listAvailable();
    expect(before.map((p) => p.id)).toContain(partner.id);
    expect(Object.keys(before[0])).not.toContain('phone');

    const order = await acceptedOrder('Link Mart 7');
    await dispatch.assign(order.id);
    const after = await dispatch.listAvailable();
    expect(after.map((p) => p.id)).not.toContain(partner.id);
  });
});
