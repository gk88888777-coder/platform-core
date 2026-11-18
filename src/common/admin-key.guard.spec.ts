import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminKeyGuard } from './admin-key.guard';

const KEY = 'k'.repeat(24);

const makeGuard = (configured: string | undefined): AdminKeyGuard =>
  new AdminKeyGuard({ get: () => configured } as unknown as ConfigService);

const makeContext = (
  headers: Record<string, string | string[] | undefined>,
): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe('AdminKeyGuard', () => {
  it('allows the correct key', () => {
    expect(makeGuard(KEY).canActivate(makeContext({ 'x-admin-key': KEY }))).toBe(
      true,
    );
  });

  it('rejects a wrong key', () => {
    expect(() =>
      makeGuard(KEY).canActivate(makeContext({ 'x-admin-key': 'wrong' })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing key', () => {
    expect(() => makeGuard(KEY).canActivate(makeContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects everything when no key is configured', () => {
    expect(() =>
      makeGuard(undefined).canActivate(makeContext({ 'x-admin-key': KEY })),
    ).toThrow(UnauthorizedException);
  });
});
