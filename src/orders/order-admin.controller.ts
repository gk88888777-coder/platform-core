import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from '../common/admin-key.guard';
import { ListOrdersQueryDto } from './dto/list-orders.query';
import { OrderAdminService, OrderSummary } from './order-admin.service';

@UseGuards(AdminKeyGuard)
@Controller('v1/admin/orders')
export class OrderAdminController {
  constructor(private readonly admin: OrderAdminService) {}

  // GET /v1/admin/orders?status=ACCEPTED&limit=20
  @Get()
  list(@Query() query: ListOrdersQueryDto): Promise<OrderSummary[]> {
    return this.admin.list(query.status, query.limit ?? 20);
  }
}
