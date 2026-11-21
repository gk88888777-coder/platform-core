import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { Order } from '../orders/order.entity';
import { OrderOps } from './order-ops.entity';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

// टीम का काम: कॉल-पुष्टि।
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderOps]), IdentityModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
