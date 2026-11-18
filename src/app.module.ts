import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { DispatchModule } from './dispatch/dispatch.module';

@Module({
  imports: [
    // हर IP से 60 सेकंड में अधिकतम 100 माँगें
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    CatalogModule,
    OrdersModule,
    DispatchModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
