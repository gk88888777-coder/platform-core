import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthedRequest } from './auth.types';
import { Role } from './user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(
        header.slice(7).trim(),
        { algorithms: ['HS256'] },
      );
      request.user = { userId: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
