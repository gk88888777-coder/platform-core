import { randomUUID } from 'crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database/database.module';
import { AuthService } from './auth.service';
import { GOOGLE_VERIFIER, GoogleIdentity } from './google-verifier';
import { IdentityModule } from './identity.module';
import { User } from './user.entity';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Google login (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let auth: AuthService;
  let dataSource: DataSource;
  let jwt: JwtService;
  let savedEmail: string | undefined;
  let savedPhone: string | undefined;

  // असली Google की जगह नक़ली जाँचकर्ता: Token सूची में हो तभी पहचान मिलती है
  const known = new Map<string, GoogleIdentity>();
  const fakeVerifier = {
    verify: (idToken: string): Promise<GoogleIdentity> => {
      const identity = known.get(idToken);
      return identity
        ? Promise.resolve(identity)
        : Promise.reject(new UnauthorizedException());
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
      .overrideProvider(GOOGLE_VERIFIER)
      .useValue(fakeVerifier)
      .compile();
    auth = moduleRef.get(AuthService);
    dataSource = moduleRef.get(DataSource);
    jwt = moduleRef.get(JwtService);
    savedEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    savedPhone = process.env.BOOTSTRAP_ADMIN_PHONE;
  });

  afterAll(async () => {
    if (savedEmail === undefined) {
      delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    } else {
      process.env.BOOTSTRAP_ADMIN_EMAIL = savedEmail;
    }
    if (savedPhone === undefined) {
      delete process.env.BOOTSTRAP_ADMIN_PHONE;
    } else {
      process.env.BOOTSTRAP_ADMIN_PHONE = savedPhone;
    }
    await moduleRef.close();
  });

  // हर टेस्ट साफ़ हालत से शुरू: कोई Admin नहीं, कोई Bootstrap सेटिंग नहीं
  beforeEach(async () => {
    await dataSource.query(
      `UPDATE users SET "role" = 'CUSTOMER' WHERE "role" = 'ADMIN'`,
    );
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PHONE;
  });

  const newGoogleUser = (email?: string) => {
    const sub = randomUUID();
    const token = `tok-${sub}`;
    known.set(token, {
      sub,
      email: email ?? `${sub}@example.test`,
      name: 'Test User',
    });
    return { sub, token, email: known.get(token)?.email as string };
  };

  const findBySub = (sub: string): Promise<User> =>
    dataSource.getRepository(User).findOneByOrFail({ googleSub: sub });

  it('creates a CUSTOMER with no phone on the first Google login', async () => {
    const g = newGoogleUser();
    const tokens = await auth.loginWithGoogle(g.token);
    const payload = await jwt.verifyAsync<{ sub: string; role: string }>(
      tokens.accessToken,
    );
    expect(payload.role).toBe('CUSTOMER');

    const me = await auth.me(payload.sub);
    expect(me.email).toBe(g.email);
    expect(me.phone).toBeNull();
  });

  it('gives the same account on every later login (no duplicates)', async () => {
    const g = newGoogleUser();
    await auth.loginWithGoogle(g.token);
    await auth.loginWithGoogle(g.token);
    const count = await dataSource
      .getRepository(User)
      .countBy({ googleSub: g.sub });
    expect(count).toBe(1);
  });

  it('rejects a token that Google did not verify', async () => {
    await expect(auth.loginWithGoogle('tok-unknown')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not merge two Google accounts that claim the same email', async () => {
    const email = `shared-${randomUUID()}@example.test`;
    const first = newGoogleUser(email);
    const second = newGoogleUser(email);
    await auth.loginWithGoogle(first.token);
    await auth.loginWithGoogle(second.token);
    const a = await findBySub(first.sub);
    const b = await findBySub(second.sub);
    expect(a.id).not.toBe(b.id);
  });

  it('does not let a disabled account log in', async () => {
    const g = newGoogleUser();
    await auth.loginWithGoogle(g.token);
    await dataSource.query(
      `UPDATE users SET "isActive" = false WHERE "googleSub" = $1`,
      [g.sub],
    );
    await expect(auth.loginWithGoogle(g.token)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('makes the configured email the first admin', async () => {
    const g = newGoogleUser();
    process.env.BOOTSTRAP_ADMIN_EMAIL = g.email;
    const tokens = await auth.loginWithGoogle(g.token);
    const payload = await jwt.verifyAsync<{ role: string }>(tokens.accessToken);
    expect(payload.role).toBe('ADMIN');
    expect((await findBySub(g.sub)).role).toBe('ADMIN');
  });

  it('does not make any other email an admin', async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = `someone-${randomUUID()}@example.test`;
    const g = newGoogleUser();
    await auth.loginWithGoogle(g.token);
    expect((await findBySub(g.sub)).role).toBe('CUSTOMER');
  });

  it('does nothing once an admin already exists', async () => {
    const existing = newGoogleUser();
    await auth.loginWithGoogle(existing.token);
    await dataSource.query(
      `UPDATE users SET "role" = 'ADMIN' WHERE "googleSub" = $1`,
      [existing.sub],
    );

    const late = newGoogleUser();
    process.env.BOOTSTRAP_ADMIN_EMAIL = late.email;
    await auth.loginWithGoogle(late.token);
    expect((await findBySub(late.sub)).role).toBe('CUSTOMER');
  });
});
