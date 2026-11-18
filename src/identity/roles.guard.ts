import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthedRequest } from './auth.types';
import { Role } from './user.entity';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// इस्तेमाल: @UseGuards(JwtAuthGuard, RolesGuard) और @Roles('ADMIN')
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    // @Roles लिखना भूल गए तो सब बंद (fail closed)
    if (!required || required.length === 0) {
      throw new ForbiddenException();
    }
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user || !required.includes(request.user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
