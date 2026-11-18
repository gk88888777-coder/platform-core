import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../common/admin-key.guard';
import { AuthService } from './auth.service';
import { UserView } from './auth.types';
import { SetRoleDto } from './dto/set-role.dto';

// अस्थायी: पहला ADMIN बनाने का रास्ता। सब रास्ते Login पर आने के बाद Admin Key हटेगी।
@UseGuards(AdminKeyGuard)
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
