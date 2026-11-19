import { randomInt, randomUUID } from 'crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { StoreAccessService } from '../catalog/store-access.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DispatchService } from '../dispatch/dispatch.service';
import { IdentityModule } from '../identity/identity.module';
import { Role, User } from '../identity/user.entity';
import { OrderAdminService } from './order-admin.service';
import { OrderStatusService } from './order-status.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Merchant and partner flow (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let access: StoreAccessService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let admin: OrderAdminService;
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
        IdentityModule,
        CatalogModule,
        DispatchModule,
        OrdersModule,
      ],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    access = moduleRef.get(StoreAccessService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
    admin = moduleRef.get(OrderAdminService);
    dispatch = moduleRef.get(DispatchService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  // पिछले टेस्टों के बचे Partners से टकराव न हो
  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
  });

  const makeUser = async (role: Role): Promise<User> => {
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({ phone: `+91${randomInt(6000000000, 9999999999)}`, role }),
    );
  };

  // MERCHANT अकाउंट + उसकी अपनी दुकान + उसमें एक सामान
  const merchantWithStore = async () => {
    const user = await makeUser('MERCHANT');
    const store = await catalog.createStore({ name: 'Merchant Mart' });
    await access.linkOwner(store.id, user.id);
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 10,
    });
    return { user, store, product };
  };
  type Shop = Awaited<ReturnType<typeof merchantWithStore>>;

  const placeOrder = (shop: Shop) =>
    orders.create(
      {
        ...customer,
        storeId: shop.store.id,
        items: [{ productId: shop.product.id, qty: 1 }],
      },
      undefined,
      randomUUID(),
    );

  const partnerAccount = async (online: boolean) => {
    const user = await makeUser('PARTNER');
    const partner = await dispatch.createPartner('Flow Partner', '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.linkUser(partner.id, user.id);
    if (online) {
      await dispatch.setOnlineForUser(user.id, true);
    }
    return { user, partner };
  };

  it('shows a merchant only the orders of their own store', async () => {
    const a = await merchantWithStore();
    const b = await merchantWithStore();
    const orderA = await placeOrder(a);
    const orderB = await placeOrder(b);

    const listA = await admin.listForMerchant(a.user.id, undefined, 100);
    const ids = listA.map((o) => o.id);
    expect(ids).toContain(orderA.id);
    expect(ids).not.toContain(orderB.id);
    expect(Object.keys(listA[0])).not.toContain('customerPhone');
    expect(Object.keys(listA[0])).not.toContain('deliveryAddress');
  });

  it('lets a merchant accept and pack only their own order', async () => {
    const mine = await merchantWithStore();
    const other = await merchantWithStore();
    const order = await placeOrder(mine);

    await expect(
      status.advanceAsMerchant(other.user.id, order.id, 'accept'),
    ).rejects.toThrow(NotFoundException);

    const accepted = await status.advanceAsMerchant(
      mine.user.id,
      order.id,
      'accept',
    );
    expect(accepted.status).toBe('ACCEPTED');
    const packed = await status.advanceAsMerchant(mine.user.id, order.id, 'pack');
    expect(packed.status).toBe('PACKED');
  });

  it('does not link a store owner who is not a MERCHANT', async () => {
    const user = await makeUser('CUSTOMER');
    const store = await catalog.createStore({ name: 'No Owner Mart' });
    await expect(access.linkOwner(store.id, user.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('lets a merchant cancel only their own order and returns the stock', async () => {
    const shop = await merchantWithStore();
    const other = await merchantWithStore();
    const order = await placeOrder(shop);
    const stock = async () =>
      (await catalog.listProducts(shop.store.id)).find(
        (p) => p.id === shop.product.id,
      )?.stockQty;

    expect(await stock()).toBe(9);
    await expect(
      status.cancelAsMerchant(other.user.id, order.id, 'not mine'),
    ).rejects.toThrow(NotFoundException);
    expect(await stock()).toBe(9);

    await status.cancelAsMerchant(shop.user.id, order.id, 'out of stock');
    expect(await stock()).toBe(10);
  });

  it('lets only the accepted partner pick up and deliver', async () => {
    const shop = await merchantWithStore();
    const first = await partnerAccount(true);
    const second = await partnerAccount(false);
    const order = await placeOrder(shop);

    await status.advanceAsMerchant(shop.user.id, order.id, 'accept');
    const offer = await dispatch.assign(order.id);
    expect(offer.partnerId).toBe(first.partner.id);
    await dispatch.respondAsPartner(first.user.id, offer.id, 'ACCEPTED');
    await status.advanceAsMerchant(shop.user.id, order.id, 'pack');

    await expect(
      status.advanceAsPartner(second.user.id, order.id, 'dispatch'),
    ).rejects.toThrow(NotFoundException);
    const out = await status.advanceAsPartner(first.user.id, order.id, 'dispatch');
    expect(out.status).toBe('OUT_FOR_DELIVERY');

    await expect(
      status.advanceAsPartner(second.user.id, order.id, 'deliver'),
    ).rejects.toThrow(NotFoundException);
    const done = await status.advanceAsPartner(first.user.id, order.id, 'deliver');
    expect(done.status).toBe('DELIVERED');
  });

  it('does not let a partner pick up before accepting the offer', async () => {
    const shop = await merchantWithStore();
    const partner = await partnerAccount(true);
    const order = await placeOrder(shop);

    await status.advanceAsMerchant(shop.user.id, order.id, 'accept');
    await dispatch.assign(order.id);
    await status.advanceAsMerchant(shop.user.id, order.id, 'pack');

    await expect(
      status.advanceAsPartner(partner.user.id, order.id, 'dispatch'),
    ).rejects.toThrow(NotFoundException);
  });
});
