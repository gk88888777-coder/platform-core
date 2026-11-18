import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/admin-key.guard';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderStatusService, OrderStatusView } from './order-status.service';

// अस्थायी: असली लॉगिन बनने पर दुकानदार और Partner अपने हिस्से के बदलाव ख़ुद करेंगे।
@UseGuards(AdminKeyGuard)
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
