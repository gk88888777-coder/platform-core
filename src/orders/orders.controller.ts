import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminKeyGuard } from '../common/admin-key.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order } from './order.entity';
import { OrderView, OrdersService } from './orders.service';

@Controller('v1')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // Order बनाना: सख़्त सीमा, 1 मिनट में 10 माँगें
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('orders')
  create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderView> {
    if (
      idempotencyKey !== undefined &&
      !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)
    ) {
      throw new BadRequestException('Invalid Idempotency-Key');
    }
    return this.orders.create(dto, idempotencyKey);
  }

  // अभी सिर्फ़ Admin: ग्राहक का Order देखना असली लॉगिन के बाद
  @UseGuards(AdminKeyGuard)
  @Get('admin/orders/:id')
  getForAdmin(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.orders.getForAdmin(id);
  }
}
