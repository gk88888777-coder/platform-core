import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthedRequest } from './auth.types';
import { RolesGuard } from './roles.guard';
import { Role } from './user.entity';

const makeGuard = (required: Role[] | undefined): RolesGuard =>
  new RolesGuard({ getAllAndOverride: () => required } as unknown as Reflector);

const makeContext = (user?: AuthedRequest['user']): ExecutionContext => {
  const request: AuthedRequest = { headers: {}, user };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  it('allows a matching role', () => {
    const guard = makeGuard(['ADMIN']);
    expect(
      guard.canActivate(makeContext({ userId: 'u', role: 'ADMIN' })),
    ).toBe(true);
  });

  it('forbids a different role', () => {
    const guard = makeGuard(['ADMIN']);
    expect(() =>
      guard.canActivate(makeContext({ userId: 'u', role: 'CUSTOMER' })),
    ).toThrow(ForbiddenException);
  });

  it('forbids everyone when no roles are declared', () => {
    const guard = makeGuard(undefined);
    expect(() =>
      guard.canActivate(makeContext({ userId: 'u', role: 'ADMIN' })),
    ).toThrow(ForbiddenException);
  });
});
