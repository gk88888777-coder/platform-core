import {
  Body,
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
import { CallResultDto } from './dto/call-result.dto';
import { PendingCallsQueryDto } from './dto/pending-calls.query';
import { CallResultView, OpsService, PendingCall } from './ops.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('v1/admin/ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  // GET /v1/admin/ops/calls/pending?limit=50
  @Get('calls/pending')
  pending(@Query() query: PendingCallsQueryDto): Promise<PendingCall[]> {
    return this.ops.listPendingCalls(query.limit ?? 50);
  }

  @HttpCode(200)
  @Post('orders/:id/call-result')
  record(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CallResultDto,
  ): Promise<CallResultView> {
    return this.ops.recordResult(id, currentUserId(request), dto.outcome, dto.note);
  }
}
