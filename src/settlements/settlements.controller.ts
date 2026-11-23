import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthedRequest } from '../identity/auth.types';
import { currentUserId } from '../identity/current-user';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { DailyReportQueryDto } from './dto/daily-report.query';
import {
  DailyReport,
  MerchantSummary,
  PartnerSummary,
  SettlementsService,
} from './settlements.service';

// Partner ख़ुद अपने Token से
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARTNER')
@Controller('v1/partner/earnings')
export class PartnerEarningsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  summary(@Req() request: AuthedRequest): Promise<PartnerSummary> {
    return this.settlements.partnerSummary(currentUserId(request));
  }
}

// दुकानदार ख़ुद अपने Token से
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MERCHANT')
@Controller('v1/merchant/balance')
export class MerchantBalanceController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  summary(@Req() request: AuthedRequest): Promise<MerchantSummary> {
    return this.settlements.merchantSummary(currentUserId(request));
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('v1/admin/reports')
export class ReportsController {
  constructor(private readonly settlements: SettlementsService) {}

  // GET /v1/admin/reports/daily?date=2026-11-25
  @Get('daily')
  daily(@Query() query: DailyReportQueryDto): Promise<DailyReport> {
    return this.settlements.dailyReport(query.date);
  }
}
