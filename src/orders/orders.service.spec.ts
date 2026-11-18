import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('OrdersService (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let catalog: CatalogService;
  let orders: OrdersService;

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
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const makeProduct = async (storeId: string, name: string, stock: number) =>
    catalog.createProduct({
      storeId,
      name,
      pricePaise: 5000,
      stockQty: stock,
    });

  const stockOf = async (storeId: string, productId: string) => {
    const list = await catalog.listProducts(storeId);
    return list.find((p) => p.id === productId)?.stockQty;
  };

  it('computes the total on the server and reduces stock', async () => {
    const store = await catalog.createStore({ name: 'Order Mart 1' });
    const product = await makeProduct(store.id, 'Rice 1kg', 10);

    const view = await orders.create({
      ...customer,
      storeId: store.id,
      items: [{ productId: product.id, qty: 2 }],
    });

    expect(view.subtotalPaise).toBe(10000);
    expect(view.totalPaise).toBe(view.subtotalPaise + view.deliveryFeePaise);
    expect(await stockOf(store.id, product.id)).toBe(8);
  });

  it('rolls back everything when one item is short on stock', async () => {
    const store = await catalog.createStore({ name: 'Order Mart 2' });
    const plenty = await makeProduct(store.id, 'Plenty item', 5);
    const scarce = await makeProduct(store.id, 'Scarce item', 1);

    await expect(
      orders.create({
        ...customer,
        storeId: store.id,
        items: [
          { productId: plenty.id, qty: 2 },
          { productId: scarce.id, qty: 2 },
        ],
      }),
    ).rejects.toThrow(ConflictException);

    expect(await stockOf(store.id, plenty.id)).toBe(5);
    expect(await stockOf(store.id, scarce.id)).toBe(1);
  });

  it('does not create a second order for a repeated Idempotency-Key', async () => {
    const store = await catalog.createStore({ name: 'Order Mart 3' });
    const product = await makeProduct(store.id, 'Tea', 10);
    const key = `idem-${randomUUID()}`;
    const request = {
      ...customer,
      storeId: store.id,
      items: [{ productId: product.id, qty: 1 }],
    };

    const first = await orders.create(request, key);
    const second = await orders.create(request, key);

    expect(second.id).toBe(first.id);
    expect(await stockOf(store.id, product.id)).toBe(9);
  });

  it('rejects the same key with a different request', async () => {
    const store = await catalog.createStore({ name: 'Order Mart 4' });
    const product = await makeProduct(store.id, 'Sugar', 10);
    const key = `idem-${randomUUID()}`;

    await orders.create(
      {
        ...customer,
        storeId: store.id,
        items: [{ productId: product.id, qty: 1 }],
      },
      key,
    );

    await expect(
      orders.create(
        {
          ...customer,
          storeId: store.id,
          items: [{ productId: product.id, qty: 2 }],
        },
        key,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a product that belongs to another store', async () => {
    const storeA = await catalog.createStore({ name: 'Order Mart 5A' });
    const storeB = await catalog.createStore({ name: 'Order Mart 5B' });
    const productB = await makeProduct(storeB.id, 'Other store item', 5);

    await expect(
      orders.create({
        ...customer,
        storeId: storeA.id,
        items: [{ productId: productB.id, qty: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
