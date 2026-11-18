import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthedRequest, UserView } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('v1/me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@Req() request: AuthedRequest): Promise<UserView> {
    if (!request.user) {
      throw new UnauthorizedException();
    }
    return this.auth.me(request.user.userId);
  }
}
