import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthedRequest } from '../identity/auth.types';
import { currentUserId } from '../identity/current-user';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import {
  AddressView,
  CustomersService,
  ProfileView,
} from './customers.service';
import { CreateAddressDto } from './dto/address.dto';
import { UpsertProfileDto } from './dto/profile.dto';

// ग्राहक ख़ुद अपने Token से: सिर्फ़ अपने पते और प्रोफ़ाइल
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CUSTOMER')
@Controller('v1/me')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('addresses')
  list(@Req() request: AuthedRequest): Promise<AddressView[]> {
    return this.customers.listAddresses(currentUserId(request));
  }

  @Post('addresses')
  create(
    @Req() request: AuthedRequest,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressView> {
    return this.customers.createAddress(currentUserId(request), dto);
  }

  @Delete('addresses/:id')
  async remove(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.customers.removeAddress(currentUserId(request), id);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('addresses/:id/default')
  setDefault(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AddressView> {
    return this.customers.setDefault(currentUserId(request), id);
  }

  @Get('profile')
  profile(@Req() request: AuthedRequest): Promise<ProfileView> {
    return this.customers.getProfile(currentUserId(request));
  }

  @Put('profile')
  saveProfile(
    @Req() request: AuthedRequest,
    @Body() dto: UpsertProfileDto,
  ): Promise<ProfileView> {
    return this.customers.upsertProfile(currentUserId(request), dto);
  }
}
