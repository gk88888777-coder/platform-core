import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { Store } from './store.entity';
import { Product } from './product.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';

// दुकानों का सामान और Stock।
@Module({
  imports: [TypeOrmModule.forFeature([Store, Product]), IdentityModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [TypeOrmModule, CatalogService],
})
export class CatalogModule {}
