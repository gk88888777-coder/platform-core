import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthedRequest } from '../identity/auth.types';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query';
import { Order } from './order.entity';
import { OrderListItem, OrderView, OrdersService } from './orders.service';

const userIdOf = (request: AuthedRequest): string => {
  if (!request.user) {
    throw new UnauthorizedException();
  }
  return request.user.userId;
};

@Controller('v1')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // ग्राहक: Order बनाना। सख़्त सीमा, 1 मिनट में 10 माँगें।
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('orders')
  create(
    @Req() request: AuthedRequest,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderView> {
    if (
      idempotencyKey !== undefined &&
      !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)
    ) {
      throw new BadRequestException('Invalid Idempotency-Key');
    }
    return this.orders.create(dto, idempotencyKey, userIdOf(request));
  }

  // ग्राहक: अपने Orders की सूची
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Get('orders')
  listMine(
    @Req() request: AuthedRequest,
    @Query() query: ListOrdersQueryDto,
  ): Promise<OrderListItem[]> {
    return this.orders.listForCustomer(
      userIdOf(request),
      query.status,
      query.limit ?? 20,
    );
  }

  // ग्राहक: अपना एक Order
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Get('orders/:id')
  getMine(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderView> {
    return this.orders.getForCustomer(id, userIdOf(request));
  }

  // Admin: किसी भी Order का पूरा ब्योरा
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/orders/:id')
  getForAdmin(@Param('id', ParseUUIDPipe) id: string): Promise<Order> {
    return this.orders.getForAdmin(id);
  }
}
