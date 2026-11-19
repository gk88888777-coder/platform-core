import { randomInt, randomUUID } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { DatabaseModule } from '../database/database.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { DispatchService } from '../dispatch/dispatch.service';
import { IdentityModule } from '../identity/identity.module';
import { Role, User } from '../identity/user.entity';
import { OrderStatusService } from './order-status.service';
import { OrdersModule } from './orders.module';
import { OrdersService } from './orders.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Ownership and partner self-service (integration)', () => {
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
    dispatch = moduleRef.get(DispatchService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dataSource.query('UPDATE partners SET "isOnline" = false');
  });

  const makeUser = async (role: Role): Promise<User> => {
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({ phone: `+91${randomInt(6000000000, 9999999999)}`, role }),
    );
  };

  const placeOrder = async (customerId: string, key?: string) => {
    const store = await catalog.createStore({ name: 'Own Mart' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Item',
      pricePaise: 5000,
      stockQty: 10,
    });
    return orders.create(
      { ...customer, storeId: store.id, items: [{ productId: product.id, qty: 1 }] },
      key,
      customerId,
    );
  };

  // PARTNER Role वाला अकाउंट + सत्यापित Partner प्रोफ़ाइल, जुड़ा हुआ
  const linkedPartner = async () => {
    const user = await makeUser('PARTNER');
    const partner = await dispatch.createPartner('Linked Partner', '9000000000');
    await dispatch.verifyPartner(partner.id);
    await dispatch.linkUser(partner.id, user.id);
    return { user, partner };
  };

  it('lets a customer see only their own order', async () => {
    const alice = randomUUID();
    const bob = randomUUID();
    const order = await placeOrder(alice);
    await expect(orders.getForCustomer(order.id, alice)).resolves.toMatchObject({
      id: order.id,
    });
    await expect(orders.getForCustomer(order.id, bob)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('keeps Idempotency-Keys separate for each customer', async () => {
    const key = `idem-${randomUUID()}`;
    const first = await placeOrder(randomUUID(), key);
    const second = await placeOrder(randomUUID(), key);
    expect(second.id).not.toBe(first.id);
  });

  it('does not link a user who is not a PARTNER', async () => {
    const user = await makeUser('CUSTOMER');
    const partner = await dispatch.createPartner('Not Linked', '9000000001');
    await expect(dispatch.linkUser(partner.id, user.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('does not let a partner go online before verification', async () => {
    const user = await makeUser('PARTNER');
    const partner = await dispatch.createPartner('Unverified', '9000000002');
    await dispatch.linkUser(partner.id, user.id);
    await expect(dispatch.setOnlineForUser(user.id, true)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets a partner answer only their own offer', async () => {
    const first = await linkedPartner();
    const second = await linkedPartner();
    await dispatch.setOnlineForUser(first.user.id, true);

    const placed = await placeOrder(randomUUID());
    await status.advance(placed.id, 'accept');
    const offer = await dispatch.assign(placed.id);
    expect(offer.partnerId).toBe(first.partner.id);

    await expect(
      dispatch.respondAsPartner(second.user.id, offer.id, 'ACCEPTED'),
    ).rejects.toThrow(NotFoundException);

    const answered = await dispatch.respondAsPartner(
      first.user.id,
      offer.id,
      'ACCEPTED',
    );
    expect(answered.status).toBe('ACCEPTED');
  });
});
