import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthedRequest } from '../identity/auth.types';
import { currentUserId } from '../identity/current-user';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { OrderStatusService, OrderStatusView } from './order-status.service';

// Delivery Partner ख़ुद अपने Token से: सामान उठाया और डिलीवर हुआ
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARTNER')
@Controller('v1/partner/orders')
export class PartnerOrdersController {
  constructor(private readonly status: OrderStatusService) {}

  @Post(':id/pickup')
  pickup(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderStatusView> {
    return this.status.advanceAsPartner(currentUserId(request), id, 'dispatch');
  }

  @Post(':id/deliver')
  deliver(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderStatusView> {
    return this.status.advanceAsPartner(currentUserId(request), id, 'deliver');
  }
}
