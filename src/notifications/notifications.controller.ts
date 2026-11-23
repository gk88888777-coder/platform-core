import {
  Controller,
  Get,
  HttpCode,
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
import { ListNotificationsQueryDto } from './dto/list-notifications.query';
import { NotificationView, NotificationsService } from './notifications.service';

// हर व्यक्ति सिर्फ़ अपनी सूचनाएँ
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER', 'MERCHANT', 'PARTNER')
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // GET /v1/notifications?unread=true&limit=20
  @Get()
  list(
    @Req() request: AuthedRequest,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationView[]> {
    return this.notifications.list(
      currentUserId(request),
      query.unread === 'true',
      query.limit ?? 20,
    );
  }

  @Get('unread-count')
  async unreadCount(@Req() request: AuthedRequest): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(currentUserId(request)) };
  }

  @HttpCode(200)
  @Post('read-all')
  async readAll(@Req() request: AuthedRequest): Promise<{ updated: number }> {
    return { updated: await this.notifications.markAllRead(currentUserId(request)) };
  }

  @HttpCode(200)
  @Post(':id/read')
  async read(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.notifications.markRead(currentUserId(request), id);
    return { ok: true };
  }
}
