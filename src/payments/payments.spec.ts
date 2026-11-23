import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DispatchService } from '../dispatch/dispatch.service';
import { EventsService } from '../events/events.service';
import { IdentityModule } from '../identity/identity.module';
import { OrderStatusService } from '../orders/order-status.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { PaymentsModule } from './payments.module';
import { PaymentsService } from './payments.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

interface Row {
  account: string;
  direction: 'DEBIT' | 'CREDIT';
  amountPaise: number;
  kind: string;
}

suite('Payments ledger (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let catalog: CatalogService;
  let orders: OrdersService;
  let status: OrderStatusService;
  let dispatch: DispatchService;
  let events: EventsService;
  let payments: PaymentsService;

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
      ],
    }).compile();
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    catalog = moduleRef.get(CatalogService);
    orders = moduleRef.get(OrdersService);
    status = moduleRef.get(OrderStatusService);
    dispatch = moduleRef.get(DispatchService);
    events = moduleRef.get(EventsService);
    payments = moduleRef.get(PaymentsService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
    delete process.env.COMMISSION_BPS;
  });

  const drain = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) {
      if ((await events.processPending(200)) === 0) {
        return;
      }
    }
  };

  const entries = (orderId: string): Promise<Row[]> =>
    dataSource.query(
      `SELECT "account","direction","amountPaise","kind" FROM ledger_entries WHERE "orderId" = $1`,
      [orderId],
    );

  const sum = (rows: Row[], direction: 'DEBIT' | 'CREDIT'): number =>
    rows.filter((r) => r.direction === direction).reduce((t, r) => t + r.amountPaise, 0);

  // एक नई दुकान, एक नया Partner, और पूरा सफ़र: स्वीकार, सौंपना, पैक, निकलना, डिलीवर
  const delivered = async (pricePaise = 5000) => {
    const store = await catalog.createStore({ name: 'Pay Mart' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise,
      stockQty: 20,
    });
    const partner = await dispatch.createPartner('Pay Partner', '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.setOnline(partner.id, true);

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
    return { store, partner, order };
  };

  it('posts a balanced entry set when a COD order is delivered', async () => {
    const { store, partner, order } = await delivered();
    await drain();

    const full = await orders.getForAdmin(order.id);
    const rows = await entries(order.id);
    expect(sum(rows, 'DEBIT')).toBe(full.totalPaise);
    expect(sum(rows, 'CREDIT')).toBe(full.totalPaise);

    const cash = rows.find((r) => r.account === `CASH_WITH_PARTNER:${partner.id}`);
    expect(cash?.direction).toBe('DEBIT');
    expect(cash?.amountPaise).toBe(full.totalPaise);
    expect(await payments.cashWithPartner(partner.id)).toBe(full.totalPaise);
    expect(await payments.merchantPayable(store.id)).toBe(full.subtotalPaise);
  });

  it('does not post twice when the same event runs again', async () => {
    const { order } = await delivered();
    await drain();
    const before = (await entries(order.id)).length;

    await dataSource.query(
      `UPDATE outbox_events SET "processedAt" = NULL, attempts = 0 WHERE "aggregateId" = $1 AND type = 'order.delivered'`,
      [order.id],
    );
    await drain();

    expect((await entries(order.id)).length).toBe(before);
  });

  it('takes the commission from the shop\'s share when it is configured', async () => {
    process.env.COMMISSION_BPS = '1000';
    try {
      const { store, order } = await delivered(10000);
      await drain();

      const rows = await entries(order.id);
      const commission = rows.find((r) => r.account === 'PLATFORM_COMMISSION');
      expect(commission?.amountPaise).toBe(1000);
      expect(await payments.merchantPayable(store.id)).toBe(9000);
      expect(sum(rows, 'DEBIT')).toBe(sum(rows, 'CREDIT'));
    } finally {
      delete process.env.COMMISSION_BPS;
    }
  });

  it('posts nothing for a cancelled order', async () => {
    const store = await catalog.createStore({ name: 'Pay Mart' });
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
    await status.cancel(order.id, 'test');
    await drain();

    expect(await entries(order.id)).toEqual([]);
  });

  it('accepts a cash deposit from the partner but never more than the cash held', async () => {
    const { partner, order } = await delivered();
    await drain();
    const full = await orders.getForAdmin(order.id);
    const admin = randomUUID();

    const half = Math.floor(full.totalPaise / 2);
    const first = await payments.recordCashDeposit(partner.id, half, admin);
    expect(first.balancePaise).toBe(full.totalPaise - half);

    await expect(
      payments.recordCashDeposit(partner.id, full.totalPaise, admin),
    ).rejects.toThrow(ConflictException);

    const rest = await payments.recordCashDeposit(partner.id, full.totalPaise - half, admin);
    expect(rest.balancePaise).toBe(0);
  });

  it('pays the shop but never more than what it is owed', async () => {
    const { store, order } = await delivered();
    await drain();
    const full = await orders.getForAdmin(order.id);
    const admin = randomUUID();

    await expect(
      payments.recordMerchantPayout(store.id, full.subtotalPaise + 1, admin),
    ).rejects.toThrow(ConflictException);

    const paid = await payments.recordMerchantPayout(store.id, 1000, admin);
    expect(paid.balancePaise).toBe(full.subtotalPaise - 1000);
    expect(await payments.merchantPayable(store.id)).toBe(full.subtotalPaise - 1000);
  });

  it('rejects zero, negative and fractional payouts', async () => {
    const { store } = await delivered();
    await drain();
    const admin = randomUUID();
    for (const amount of [0, -5, 10.5]) {
      await expect(
        payments.recordMerchantPayout(store.id, amount, admin),
      ).rejects.toThrow(ConflictException);
    }
  });

  it('refuses an unbalanced posting', async () => {
    await expect(
      payments.post({ kind: 'TEST' }, [
        { account: 'A', direction: 'DEBIT', amountPaise: 100 },
        { account: 'B', direction: 'CREDIT', amountPaise: 90 },
      ]),
    ).rejects.toThrow('Unbalanced');
  });
});
