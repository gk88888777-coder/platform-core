import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/admin-key.guard';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { LinkUserDto } from './dto/link-user.dto';
import { SetOnlineDto } from './dto/set-online.dto';
import {
  AssignmentView,
  DispatchService,
  PartnerView,
} from './dispatch.service';
import { Partner } from './partner.entity';

// अस्थायी: Admin के रास्ते अभी Admin Key पर हैं, अगले Step में ADMIN Role पर आएँगे।
@UseGuards(AdminKeyGuard)
@Controller('v1/admin')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('partners')
  list(): Promise<PartnerView[]> {
    return this.dispatch.listPartners();
  }

  @Get('partners/available')
  available(): Promise<PartnerView[]> {
    return this.dispatch.listAvailable();
  }

  @Post('partners')
  createPartner(@Body() dto: CreatePartnerDto): Promise<Partner> {
    return this.dispatch.createPartner(dto.name, dto.phone);
  }

  @Post('partners/:id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string): Promise<Partner> {
    return this.dispatch.verifyPartner(id);
  }

  @Post('partners/:id/link-user')
  linkUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkUserDto,
  ): Promise<PartnerView> {
    return this.dispatch.linkUser(id, dto.userId);
  }

  @Patch('partners/:id/online')
  setOnline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOnlineDto,
  ): Promise<Partner> {
    return this.dispatch.setOnline(id, dto.isOnline);
  }

  @Post('orders/:id/assign')
  assign(@Param('id', ParseUUIDPipe) id: string): Promise<AssignmentView> {
    return this.dispatch.assign(id);
  }

  @Post('assignments/:id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string): Promise<AssignmentView> {
    return this.dispatch.accept(id);
  }

  @Post('assignments/:id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string): Promise<AssignmentView> {
    return this.dispatch.reject(id);
  }
}
