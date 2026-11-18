import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { OrderAdminController } from './order-admin.controller';
import { OrderAdminService } from './order-admin.service';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';
import { OrderStatusController } from './order-status.controller';
import { OrderStatusService } from './order-status.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// Order का चक्र।
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    CatalogModule,
    DispatchModule,
  ],
  controllers: [OrdersController, OrderStatusController, OrderAdminController],
  providers: [OrdersService, OrderStatusService, OrderAdminService],
  exports: [OrderAdminService],
})
export class OrdersModule {}
