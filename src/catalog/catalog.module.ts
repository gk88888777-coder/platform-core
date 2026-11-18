import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './store.entity';
import { Product } from './product.entity';

// दुकानों का सामान और Stock।
@Module({
  imports: [TypeOrmModule.forFeature([Store, Product])],
  exports: [TypeOrmModule],
})
export class CatalogModule {}
