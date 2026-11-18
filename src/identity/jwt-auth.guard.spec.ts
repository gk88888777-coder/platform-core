import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthedRequest } from './auth.types';
import { JwtAuthGuard } from './jwt-auth.guard';

const SECRET = 's'.repeat(40);

const makeContext = (
  authorization?: string,
): { context: ExecutionContext; request: AuthedRequest } => {
  const request: AuthedRequest = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
};

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard(new JwtService({ secret: SECRET }));
  const signer = new JwtService({ secret: SECRET });

  it('accepts a valid token and sets the user', async () => {
    const token = await signer.signAsync(
      { sub: 'user-1', role: 'CUSTOMER' },
      { expiresIn: 60 },
    );
    const { context, request } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'user-1', role: 'CUSTOMER' });
  });

  it('rejects a missing header', async () => {
    const { context } = makeContext();
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with another secret', async () => {
    const other = new JwtService({ secret: 'x'.repeat(40) });
    const token = await other.signAsync(
      { sub: 'user-1', role: 'ADMIN' },
      { expiresIn: 60 },
    );
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const token = await signer.signAsync({
      sub: 'user-1',
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const { context } = makeContext(`Bearer ${token}`);
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a tampered token', async () => {
    const token = await signer.signAsync(
      { sub: 'user-1', role: 'CUSTOMER' },
      { expiresIn: 60 },
    );
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    const { context } = makeContext(`Bearer ${tampered}`);
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
