import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CatalogService } from './catalog.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { LinkOwnerDto } from './dto/link-owner.dto';
import { SetStockDto } from './dto/set-stock.dto';
import { Product } from './product.entity';
import { Store } from './store.entity';
import { StoreAccessService } from './store-access.service';

@Controller('v1')
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly access: StoreAccessService,
  ) {}

  // सबके लिए खुला: दुकान का सामान देखना
  @Get('stores/:storeId/products')
  list(
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ): Promise<Product[]> {
    return this.catalog.listProducts(storeId);
  }

  // नीचे के सब सिर्फ़ ADMIN Role से
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/stores')
  createStore(@Body() dto: CreateStoreDto): Promise<Store> {
    return this.catalog.createStore(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/stores/:id/link-owner')
  linkOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkOwnerDto,
  ): Promise<{ id: string; ownerUserId: string }> {
    return this.access.linkOwner(id, dto.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/products')
  createProduct(@Body() dto: CreateProductDto): Promise<Product> {
    return this.catalog.createProduct(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('admin/products/:id/stock')
  setStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStockDto,
  ): Promise<Product> {
    return this.catalog.setStock(id, dto.stockQty);
  }
}
