import { randomInt, randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { StoreAccessService } from '../catalog/store-access.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DispatchService } from '../dispatch/dispatch.service';
import { EventsService } from '../events/events.service';
import { IdentityModule } from '../identity/identity.module';
import { Role, User } from '../identity/user.entity';
import { OrderStatusService } from '../orders/order-status.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { SettlementsModule } from './settlements.module';
import { SettlementsService } from './settlements.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Earnings and settlements (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let access: StoreAccessService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let dispatch: DispatchService;
  let events: EventsService;
  let payments: PaymentsService;
  let settlements: SettlementsService;

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
        PaymentsModule,
        SettlementsModule,
      ],
    }).compile();
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    access = moduleRef.get(StoreAccessService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
    dispatch = moduleRef.get(DispatchService);
    events = moduleRef.get(EventsService);
    payments = moduleRef.get(PaymentsService);
    settlements = moduleRef.get(SettlementsService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
    delete process.env.PARTNER_PAYOUT_PAISE;
  });

  const drain = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) {
      if ((await events.processPending(200)) === 0) {
        return;
      }
    }
  };

  const makeUser = async (role: Role): Promise<User> => {
    const users = dataSource.getRepository(User);
    return users.save(
      users.create({ phone: `+91${randomInt(6000000000, 9999999999)}`, role }),
    );
  };

  // PARTNER अकाउंट + जुड़ी प्रोफ़ाइल, MERCHANT अकाउंट + जुड़ी दुकान, और एक डिलीवर हुआ Order
  const deliveredOrder = async () => {
    const partnerUser = await makeUser('PARTNER');
    const partner = await dispatch.createPartner('Settle Partner', '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.linkUser(partner.id, partnerUser.id);
    await dispatch.setOnline(partner.id, true);

    const merchantUser = await makeUser('MERCHANT');
    const store = await catalog.createStore({ name: 'Settle Mart' });
    await access.linkOwner(store.id, merchantUser.id);
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 20,
    });

    const order = await orders.create(
      { ...customer, storeId: store.id, items: [{ productId: product.id, qty: 1 }] },
      undefined,
      randomUUID(),
    );
    await status.advance(order.id, 'accept');
    const offer = await dispatch.assign(order.id);
    await dispatch.accept(offer.id);
    await status.advance(order.id, 'pack');
    await status.advance(order.id, 'dispatch');
    await status.advance(order.id, 'deliver');
    await drain();
    return { partnerUser, partner, merchantUser, store, order };
  };

  it('credits the partner with the delivery fee by default', async () => {
    const { partnerUser, order } = await deliveredOrder();
    const full = await orders.getForAdmin(order.id);

    const summary = await settlements.partnerSummary(partnerUser.id);
    expect(summary.earningsPayablePaise).toBe(full.deliveryFeePaise);
    expect(summary.cashInHandPaise).toBe(full.totalPaise);
    expect(summary.deliveriesCompleted).toBe(1);
  });

  it('uses the configured earning per delivery', async () => {
    process.env.PARTNER_PAYOUT_PAISE = '3000';
    try {
      const { partnerUser } = await deliveredOrder();
      const summary = await settlements.partnerSummary(partnerUser.id);
      expect(summary.earningsPayablePaise).toBe(3000);
    } finally {
      delete process.env.PARTNER_PAYOUT_PAISE;
    }
  });

  it('pays the partner but never more than the earnings owed', async () => {
    const { partnerUser, partner } = await deliveredOrder();
    const owed = (await settlements.partnerSummary(partnerUser.id)).earningsPayablePaise;
    const admin = randomUUID();

    await expect(
      payments.recordPartnerPayout(partner.id, owed + 1, admin),
    ).rejects.toThrow(ConflictException);

    await payments.recordPartnerPayout(partner.id, 500, admin);
    const after = await settlements.partnerSummary(partnerUser.id);
    expect(after.earningsPayablePaise).toBe(owed - 500);
  });

  it('shows the shop owner only the balance of their own shop', async () => {
    const mine = await deliveredOrder();
    const other = await deliveredOrder();
    const full = await orders.getForAdmin(mine.order.id);

    const summary = await settlements.merchantSummary(mine.merchantUser.id);
    expect(summary.stores).toEqual([
      { storeId: mine.store.id, payablePaise: full.subtotalPaise },
    ]);
    expect(summary.totalPayablePaise).toBe(full.subtotalPaise);
    expect(summary.stores.map((s) => s.storeId)).not.toContain(other.store.id);
  });

  it('gives a user with no partner profile no earnings view', async () => {
    const stranger = await makeUser('PARTNER');
    await expect(settlements.partnerSummary(stranger.id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('reports today\'s delivered orders', async () => {
    const { order } = await deliveredOrder();
    const full = await orders.getForAdmin(order.id);

    const report = await settlements.dailyReport();
    expect(report.orders).toBeGreaterThanOrEqual(1);
    expect(report.grossPaise).toBeGreaterThanOrEqual(full.totalPaise);
    expect(report.deliveryFeesPaise).toBeGreaterThanOrEqual(full.deliveryFeePaise);
  });

  it('refuses an impossible date', async () => {
    await expect(settlements.dailyReport('2026-02-31')).rejects.toThrow(
      BadRequestException,
    );
    await expect(settlements.dailyReport('not-a-date')).rejects.toThrow(
      BadRequestException,
    );
  });
});
