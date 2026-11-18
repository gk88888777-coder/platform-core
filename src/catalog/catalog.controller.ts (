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
import { AdminKeyGuard } from '../common/admin-key.guard';
import { CatalogService } from './catalog.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { SetStockDto } from './dto/set-stock.dto';
import { Product } from './product.entity';
import { Store } from './store.entity';

@Controller('v1')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // सबके लिए खुला: दुकान का सामान देखना
  @Get('stores/:storeId/products')
  list(
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ): Promise<Product[]> {
    return this.catalog.listProducts(storeId);
  }

  // नीचे के तीनों सिर्फ़ Admin Key से
  @UseGuards(AdminKeyGuard)
  @Post('admin/stores')
  createStore(@Body() dto: CreateStoreDto): Promise<Store> {
    return this.catalog.createStore(dto);
  }

  @UseGuards(AdminKeyGuard)
  @Post('admin/products')
  createProduct(@Body() dto: CreateProductDto): Promise<Product> {
    return this.catalog.createProduct(dto);
  }

  @UseGuards(AdminKeyGuard)
  @Patch('admin/products/:id/stock')
  setStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStockDto,
  ): Promise<Product> {
    return this.catalog.setStock(id, dto.stockQty);
  }
}
