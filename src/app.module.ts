import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { DispatchModule } from './dispatch/dispatch.module';

@Module({
  imports: [CatalogModule, OrdersModule, DispatchModule],
  controllers: [HealthController],
})
export class AppModule {}
