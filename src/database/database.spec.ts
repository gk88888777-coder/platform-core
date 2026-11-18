import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseModule } from './database.module';
import { CatalogModule } from '../catalog/catalog.module';
import { Store } from '../catalog/store.entity';
import { Product } from '../catalog/product.entity';

// यह टेस्ट तभी चलता है जब Database का पता उपलब्ध हो (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Database + Catalog (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let stores: Repository<Store>;
  let products: Repository<Product>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        CatalogModule,
      ],
    }).compile();
    stores = moduleRef.get(getRepositoryToken(Store));
    products = moduleRef.get(getRepositoryToken(Product));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('saves and reads a product', async () => {
    const store = await stores.save(stores.create({ name: 'Test Mart' }));
    const saved = await products.save(
      products.create({
        storeId: store.id,
        name: 'Milk 500ml',
        pricePaise: 3000,
        stockQty: 5,
      }),
    );
    const found = await products.findOneByOrFail({ id: saved.id });
    expect(found.stockQty).toBe(5);
    expect(found.pricePaise).toBe(3000);
  });

  it('rejects negative stock', async () => {
    const store = await stores.save(stores.create({ name: 'Test Mart 2' }));
    await expect(
      products.save(
        products.create({
          storeId: store.id,
          name: 'Bad item',
          pricePaise: 1000,
          stockQty: -1,
        }),
      ),
    ).rejects.toThrow();
  });
});
