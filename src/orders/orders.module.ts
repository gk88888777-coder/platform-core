import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { IdentityModule } from '../identity/identity.module';
import { MerchantOrdersController } from './merchant-orders.controller';
import { OrderAdminController } from './order-admin.controller';
import { OrderAdminService } from './order-admin.service';
import { OrderItem } from './order-item.entity';
import { OrderLimitsService } from './order-limits.service';
import { Order } from './order.entity';
import { OrderStatusController } from './order-status.controller';
import { OrderStatusService } from './order-status.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PartnerOrdersController } from './partner-orders.controller';

// Order का चक्र।
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem]),
    CatalogModule,
    DispatchModule,
    IdentityModule,
  ],
  controllers: [
    OrdersController,
    OrderStatusController,
    OrderAdminController,
    MerchantOrdersController,
    PartnerOrdersController,
  ],
  providers: [
    OrdersService,
    OrderStatusService,
    OrderAdminService,
    OrderLimitsService,
  ],
  exports: [OrderAdminService],
})
export class OrdersModule {}
