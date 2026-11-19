import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthedRequest } from '../identity/auth.types';
import { currentUserId } from '../identity/current-user';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders.query';
import { MerchantOrderView, OrderAdminService } from './order-admin.service';
import { OrderStatusService, OrderStatusView } from './order-status.service';

// दुकानदार ख़ुद अपने Token से
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MERCHANT')
@Controller('v1/merchant/orders')
export class MerchantOrdersController {
  constructor(
    private readonly admin: OrderAdminService,
    private readonly status: OrderStatusService,
  ) {}

  // GET /v1/merchant/orders?status=CREATED&limit=20
  @Get()
  list(
    @Req() request: AuthedRequest,
    @Query() query: ListOrdersQueryDto,
  ): Promise<MerchantOrderView[]> {
    return this.admin.listForMerchant(
      currentUserId(request),
      query.status,
      query.limit ?? 20,
    );
  }

  @Post(':id/accept')
  accept(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderStatusView> {
    return this.status.advanceAsMerchant(currentUserId(request), id, 'accept');
  }

  @Post(':id/pack')
  pack(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderStatusView> {
    return this.status.advanceAsMerchant(currentUserId(request), id, 'pack');
  }

  @Post(':id/cancel')
  cancel(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderStatusView> {
    return this.status.cancelAsMerchant(currentUserId(request), id, dto.reason);
  }
}
