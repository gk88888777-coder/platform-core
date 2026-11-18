import { createHash, randomInt } from 'crypto';
import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database/database.module';
import { AuthService } from './auth.service';
import { IdentityModule } from './identity.module';
import { OTP_SENDER } from './otp-sender';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('AuthService (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let auth: AuthService;
  let dataSource: DataSource;
  let jwt: JwtService;

  // असली SMS की जगह नक़ली Sender: कोड यहीं पकड़ लेता है
  const sent = new Map<string, string>();
  const fakeSender = {
    send: (phone: string, code: string): Promise<void> => {
      sent.set(phone, code);
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        IdentityModule,
      ],
    })
      .overrideProvider(OTP_SENDER)
      .useValue(fakeSender)
      .compile();
    auth = moduleRef.get(AuthService);
    dataSource = moduleRef.get(DataSource);
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const newPhone = (): string => `+91${randomInt(6000000000, 9999999999)}`;
  const wrongCode = (real: string): string =>
    real === '111111' ? '222222' : '111111';
  const sha = (v: string): string =>
    createHash('sha256').update(v).digest('hex');

  const login = async (phone: string) => {
    await auth.requestOtp(phone);
    return auth.verifyOtp(phone, sent.get(phone) as string);
  };

  it('logs in with the right code and creates a CUSTOMER', async () => {
    const phone = newPhone();
    const tokens = await login(phone);
    const payload = await jwt.verifyAsync<{ sub: string; role: string }>(
      tokens.accessToken,
    );
    expect(payload.role).toBe('CUSTOMER');
    const me = await auth.me(payload.sub);
    expect(me.phone).toBe(phone);
  });

  it('rejects a wrong code', async () => {
    const phone = newPhone();
    await auth.requestOtp(phone);
    const real = sent.get(phone) as string;
    await expect(auth.verifyOtp(phone, wrongCode(real))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not accept the same code twice', async () => {
    const phone = newPhone();
    await auth.requestOtp(phone);
    const code = sent.get(phone) as string;
    await auth.verifyOtp(phone, code);
    await expect(auth.verifyOtp(phone, code)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('locks the code after 5 wrong attempts', async () => {
    const phone = newPhone();
    await auth.requestOtp(phone);
    const real = sent.get(phone) as string;
    for (let i = 0; i < 5; i += 1) {
      await expect(auth.verifyOtp(phone, wrongCode(real))).rejects.toThrow(
        UnauthorizedException,
      );
    }
    await expect(auth.verifyOtp(phone, real)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('limits OTP requests per phone', async () => {
    const phone = newPhone();
    await auth.requestOtp(phone);
    await auth.requestOtp(phone);
    await auth.requestOtp(phone);
    let status = 0;
    try {
      await auth.requestOtp(phone);
    } catch (error) {
      status = (error as HttpException).getStatus();
    }
    expect(status).toBe(429);
  });

  it('rotates the refresh token and rejects the old one', async () => {
    const first = await login(newPhone());
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('revokes everything when an old refresh token is replayed later', async () => {
    const first = await login(newPhone());
    const second = await auth.refresh(first.refreshToken);
    await dataSource.query(
      `UPDATE refresh_tokens SET "revokedAt" = now() - interval '1 minute' WHERE "tokenHash" = $1`,
      [sha(first.refreshToken)],
    );
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.refresh(second.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('logout makes the refresh token unusable', async () => {
    const tokens = await login(newPhone());
    await auth.logout(tokens.refreshToken);
    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not let a disabled user log in', async () => {
    const phone = newPhone();
    await login(phone);
    await dataSource.query(
      `UPDATE users SET "isActive" = false WHERE phone = $1`,
      [phone],
    );
    await auth.requestOtp(phone);
    await expect(
      auth.verifyOtp(phone, sent.get(phone) as string),
    ).rejects.toThrow(ForbiddenException);
  });

  it('changes the role and revokes the old refresh tokens', async () => {
    const tokens = await login(newPhone());
    const payload = await jwt.verifyAsync<{ sub: string }>(tokens.accessToken);
    const updated = await auth.setRole(payload.sub, 'PARTNER');
    expect(updated.role).toBe('PARTNER');
    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
