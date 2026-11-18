import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// Order का चक्र।
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem]), CatalogModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
