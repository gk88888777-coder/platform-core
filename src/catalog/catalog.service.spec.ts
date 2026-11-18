import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { CatalogModule } from './catalog.module';
import { CatalogService } from './catalog.service';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('CatalogService (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let catalog: CatalogService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        CatalogModule,
      ],
    }).compile();
    catalog = moduleRef.get(CatalogService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('rejects a product for an unknown store', async () => {
    await expect(
      catalog.createProduct({
        storeId: '11111111-1111-4111-8111-111111111111',
        name: 'Ghost item',
        pricePaise: 1000,
        stockQty: 1,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists only the products of the given store', async () => {
    const a = await catalog.createStore({ name: 'List Mart A' });
    const b = await catalog.createStore({ name: 'List Mart B' });
    await catalog.createProduct({
      storeId: a.id,
      name: 'Bread',
      pricePaise: 4000,
      stockQty: 10,
    });
    await catalog.createProduct({
      storeId: b.id,
      name: 'Eggs',
      pricePaise: 8000,
      stockQty: 10,
    });
    const list = await catalog.listProducts(a.id);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Bread');
  });

  it('reserves stock and never goes negative', async () => {
    const store = await catalog.createStore({ name: 'Stock Mart' });
    const product = await catalog.createProduct({
      storeId: store.id,
      name: 'Last items',
      pricePaise: 2500,
      stockQty: 5,
    });

    expect(await catalog.reserveStock(product.id, 3)).toBe(true);
    expect(await catalog.reserveStock(product.id, 3)).toBe(false);

    const [after] = await catalog.listProducts(store.id);
    expect(after.stockQty).toBe(2);
  });
});
