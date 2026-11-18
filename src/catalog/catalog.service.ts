import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { Store } from './store.entity';
import { Product } from './product.entity';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  createStore(dto: CreateStoreDto): Promise<Store> {
    return this.stores.save(this.stores.create({ name: dto.name }));
  }

  async createProduct(dto: CreateProductDto): Promise<Product> {
    const store = await this.stores.findOneBy({ id: dto.storeId });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return this.products.save(
      this.products.create({
        storeId: dto.storeId,
        name: dto.name,
        pricePaise: dto.pricePaise,
        stockQty: dto.stockQty,
      }),
    );
  }

  listProducts(storeId: string): Promise<Product[]> {
    return this.products.find({
      where: { storeId, isAvailable: true },
      order: { name: 'ASC' },
    });
  }

  async setStock(productId: string, stockQty: number): Promise<Product> {
    const result = await this.products.update({ id: productId }, { stockQty });
    if (!result.affected) {
      throw new NotFoundException('Product not found');
    }
    return this.products.findOneByOrFail({ id: productId });
  }

  // Order के लिए: इसी दुकान के, उपलब्ध सामान (Order की Transaction के भीतर)
  async findForOrder(
    storeId: string,
    productIds: string[],
    manager?: EntityManager,
  ): Promise<Product[]> {
    const repo = manager ? manager.getRepository(Product) : this.products;
    return repo.find({
      where: { storeId, id: In(productIds), isAvailable: true },
    });
  }

  // एक ही कमांड में Stock घटाओ, काफ़ी Stock न हो तो false लौटाओ।
  async reserveStock(
    productId: string,
    qty: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty must be a positive integer');
    }
    const em = manager ?? this.products.manager;
    const result = await em
      .createQueryBuilder()
      .update(Product)
      .set({ stockQty: () => `"stockQty" - ${qty}` })
      .where('id = :id AND "stockQty" >= :qty', { id: productId, qty })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
