import { randomInt } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database/database.module';
import { AuthService } from './auth.service';
import { IdentityModule } from './identity.module';
import { OTP_SENDER } from './otp-sender';
import { Role, User } from './user.entity';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Admin bootstrap and last-admin protection (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let auth: AuthService;
  let dataSource: DataSource;
  let savedBootstrap: string | undefined;

  // असली SMS की जगह नक़ली Sender
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
    savedBootstrap = process.env.BOOTSTRAP_ADMIN_PHONE;
  });

  afterAll(async () => {
    if (savedBootstrap === undefined) {
      delete process.env.BOOTSTRAP_ADMIN_PHONE;
    } else {
      process.env.BOOTSTRAP_ADMIN_PHONE = savedBootstrap;
    }
    await moduleRef.close();
  });

  // हर टेस्ट एक साफ़ हालत से शुरू: कोई Admin नहीं, कोई Bootstrap सेटिंग नहीं
  beforeEach(async () => {
    await dataSource.query(
      `UPDATE users SET "role" = 'CUSTOMER' WHERE "role" = 'ADMIN'`,
    );
    delete process.env.BOOTSTRAP_ADMIN_PHONE;
  });

  const newPhone = (): string => `+91${randomInt(6000000000, 9999999999)}`;

  const login = async (phone: string) => {
    await auth.requestOtp(phone);
    return auth.verifyOtp(phone, sent.get(phone) as string);
  };

  const roleOf = async (phone: string): Promise<Role> =>
    (await dataSource.getRepository(User).findOneByOrFail({ phone })).role;

  it('makes the configured phone the first admin after a real OTP login', async () => {
    const phone = newPhone();
    process.env.BOOTSTRAP_ADMIN_PHONE = phone;
    await login(phone);
    expect(await roleOf(phone)).toBe('ADMIN');
  });

  it('does not make any other phone an admin', async () => {
    process.env.BOOTSTRAP_ADMIN_PHONE = newPhone();
    const other = newPhone();
    await login(other);
    expect(await roleOf(other)).toBe('CUSTOMER');
  });

  it('does nothing once an admin already exists', async () => {
    const existing = newPhone();
    await login(existing);
    await dataSource.query(
      `UPDATE users SET "role" = 'ADMIN' WHERE phone = $1`,
      [existing],
    );

    const late = newPhone();
    process.env.BOOTSTRAP_ADMIN_PHONE = late;
    await login(late);
    expect(await roleOf(late)).toBe('CUSTOMER');
  });

  it('does not allow removing the last admin, but allows it when another exists', async () => {
    const first = newPhone();
    process.env.BOOTSTRAP_ADMIN_PHONE = first;
    await login(first);
    const firstUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ phone: first });
    delete process.env.BOOTSTRAP_ADMIN_PHONE;

    await expect(auth.setRole(firstUser.id, 'CUSTOMER')).rejects.toThrow(
      ConflictException,
    );

    const secondPhone = newPhone();
    await login(secondPhone);
    const secondUser = await dataSource
      .getRepository(User)
      .findOneByOrFail({ phone: secondPhone });
    await auth.setRole(secondUser.id, 'ADMIN');

    const demoted = await auth.setRole(firstUser.id, 'CUSTOMER');
    expect(demoted.role).toBe('CUSTOMER');
  });
});
