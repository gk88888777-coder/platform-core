import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { AmountDto } from './dto/amount.dto';
import { BalanceView, PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('v1/admin/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('partners/:id/balance')
  async partnerBalance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ cashWithPartnerPaise: number; earningsPayablePaise: number }> {
    return {
      cashWithPartnerPaise: await this.payments.cashWithPartner(id),
      earningsPayablePaise: await this.payments.partnerPayable(id),
    };
  }

  @Get('stores/:id/balance')
  async storeBalance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ payablePaise: number }> {
    return { payablePaise: await this.payments.merchantPayable(id) };
  }

  @HttpCode(200)
  @Post('partners/:id/cash-deposits')
  cashDeposit(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmountDto,
  ): Promise<BalanceView> {
    return this.payments.recordCashDeposit(id, dto.amountPaise, currentUserId(request));
  }

  @HttpCode(200)
  @Post('partners/:id/payouts')
  partnerPayout(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmountDto,
  ): Promise<BalanceView> {
    return this.payments.recordPartnerPayout(id, dto.amountPaise, currentUserId(request));
  }

  @HttpCode(200)
  @Post('stores/:id/payouts')
  merchantPayout(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmountDto,
  ): Promise<BalanceView> {
    return this.payments.recordMerchantPayout(id, dto.amountPaise, currentUserId(request));
  }
}
