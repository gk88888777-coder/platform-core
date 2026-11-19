import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthedRequest } from '../identity/auth.types';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { Roles, RolesGuard } from '../identity/roles.guard';
import { SetOnlineDto } from './dto/set-online.dto';
import {
  AssignmentView,
  DispatchService,
  PartnerView,
} from './dispatch.service';

const userIdOf = (request: AuthedRequest): string => {
  if (!request.user) {
    throw new UnauthorizedException();
  }
  return request.user.userId;
};

// Delivery Partner ख़ुद अपने Token से
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PARTNER')
@Controller('v1/partner')
export class PartnerController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('offers')
  offers(@Req() request: AuthedRequest): Promise<AssignmentView[]> {
    return this.dispatch.offersForUser(userIdOf(request));
  }

  @Patch('online')
  setOnline(
    @Req() request: AuthedRequest,
    @Body() dto: SetOnlineDto,
  ): Promise<PartnerView> {
    return this.dispatch.setOnlineForUser(userIdOf(request), dto.isOnline);
  }

  @Post('assignments/:id/accept')
  accept(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentView> {
    return this.dispatch.respondAsPartner(userIdOf(request), id, 'ACCEPTED');
  }

  @Post('assignments/:id/reject')
  reject(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentView> {
    return this.dispatch.respondAsPartner(userIdOf(request), id, 'REJECTED');
  }
}
