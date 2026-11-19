import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { Store } from './store.entity';
import { Product } from './product.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { StoreAccessService } from './store-access.service';

// दुकानों का सामान और Stock।
@Module({
  imports: [TypeOrmModule.forFeature([Store, Product]), IdentityModule],
  controllers: [CatalogController],
  providers: [CatalogService, StoreAccessService],
  exports: [TypeOrmModule, CatalogService, StoreAccessService],
})
export class CatalogModule {}
