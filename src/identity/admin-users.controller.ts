import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserView } from './auth.types';
import { SetRoleDto } from './dto/set-role.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles, RolesGuard } from './roles.guard';

// सिर्फ़ ADMIN Role वाला Login। पहला Admin BOOTSTRAP_ADMIN_PHONE से बनता है।
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('v1/admin/users')
export class AdminUsersController {
  constructor(private readonly auth: AuthService) {}

  @HttpCode(200)
  @Post(':id/role')
  setRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRoleDto,
  ): Promise<UserView> {
    return this.auth.setRole(id, dto.role);
  }
}
