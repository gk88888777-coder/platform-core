import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

// अस्थायी: असली लॉगिन (OTP + Roles) बनने पर हटेगा।
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_API_KEY');
    // Key सेट न हो या बहुत छोटी हो तो सब बंद (fail closed)
    if (!expected || expected.length < 20) {
      throw new UnauthorizedException();
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const provided = request.headers['x-admin-key'];
    if (typeof provided !== 'string') {
      throw new UnauthorizedException();
    }

    if (!timingSafeEqual(digest(provided), digest(expected))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
