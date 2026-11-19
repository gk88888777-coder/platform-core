import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderStatusService, OrderStatusView } from './order-status.service';

// अस्थायी: दुकानदार और Partner अपने हिस्से के बदलाव ख़ुद करें, यह बाद में।
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('v1/admin/orders')
export class OrderStatusController {
  constructor(private readonly status: OrderStatusService) {}

  @Post(':id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string): Promise<OrderStatusView> {
    return this.status.advance(id, 'accept');
  }

  @Post(':id/pack')
  pack(@Param('id', ParseUUIDPipe) id: string): Promise<OrderStatusView> {
    return this.status.advance(id, 'pack');
  }

  @Post(':id/dispatch')
  dispatch(@Param('id', ParseUUIDPipe) id: string): Promise<OrderStatusView> {
    return this.status.advance(id, 'dispatch');
  }

  @Post(':id/deliver')
  deliver(@Param('id', ParseUUIDPipe) id: string): Promise<OrderStatusView> {
    return this.status.advance(id, 'deliver');
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderStatusView> {
    return this.status.cancel(id, dto.reason);
  }
}
