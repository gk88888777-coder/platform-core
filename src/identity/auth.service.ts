import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { requireSecret } from './auth-config';
import { TokenPair, UserView } from './auth.types';
import { GOOGLE_VERIFIER, GoogleTokenVerifier } from './google-verifier';
import { OtpChallenge } from './otp-challenge.entity';
import { OTP_SENDER, OtpSender } from './otp-sender';
import { RefreshToken } from './refresh-token.entity';
import { Role, User } from './user.entity';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// कमज़ोर नेटवर्क में ऐप वही माँग दोबारा भेज दे, तो इतने समय तक पूरा Logout नहीं
const REFRESH_REUSE_GRACE_MS = 10 * 1000;

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(OtpChallenge)
    private readonly challenges: Repository<OtpChallenge>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleTokenVerifier,
  ) {}

  onModuleInit(): void {
    requireSecret(this.config, 'JWT_SECRET');
    requireSecret(this.config, 'OTP_PEPPER');
  }

  // Google से Login: Token की जाँच सर्वर पर, फिर पहचान सिर्फ़ `sub` से
  async loginWithGoogle(idToken: string): Promise<TokenPair> {
    const identity = await this.google.verify(idToken);

    let user = await this.users.findOneBy({ googleSub: identity.sub });
    if (!user) {
      try {
        user = await this.users.save(
          this.users.create({
            googleSub: identity.sub,
            email: identity.email,
            name: identity.name,
            role: 'CUSTOMER',
          }),
        );
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') {
          throw error;
        }
        user = await this.users.findOneByOrFail({ googleSub: identity.sub });
      }
    } else if (user.email !== identity.email || user.name !== identity.name) {
      await this.users.update(
        { id: user.id },
        { email: identity.email, name: identity.name },
      );
      user.email = identity.email;
      user.name = identity.name;
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account disabled');
    }
    user = await this.maybeBootstrapAdmin(user);
    return this.issueTokens(user);
  }

  async requestOtp(phone: string): Promise<void> {
    const since = new Date(Date.now() - REQUEST_WINDOW_MS);
    const recent = await this.challenges.count({
      where: { phone, createdAt: MoreThan(since) },
    });
    if (recent >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challenge = await this.challenges.save(
      this.challenges.create({
        phone,
        codeHash: this.hashOtp(phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      }),
    );

    try {
      await this.sender.send(phone, code);
    } catch (error) {
      await this.challenges.delete({ id: challenge.id });
      throw error;
    }
  }

  async verifyOtp(phone: string, code: string): Promise<TokenPair> {
    const challenge = await this.challenges.findOne({
      where: { phone, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!challenge) {
      throw this.invalidCode();
    }

    // तुलना से पहले ही एक प्रयास गिन लो: होड़ में भी 5 से ज़्यादा तुलना नहीं हो सकती
    const counted = await this.challenges
      .createQueryBuilder()
      .update(OtpChallenge)
      .set({ attempts: () => '"attempts" + 1' })
      .where(
        'id = :id AND "consumedAt" IS NULL AND "attempts" < :max AND "expiresAt" > :now',
        { id: challenge.id, max: MAX_ATTEMPTS, now: new Date() },
      )
      .execute();
    if (!counted.affected) {
      throw this.invalidCode();
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const given = Buffer.from(this.hashOtp(phone, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw this.invalidCode();
    }

    // एक OTP एक ही बार: जो पहले आया वही जीतेगा
    const consumed = await this.challenges
      .createQueryBuilder()
      .update(OtpChallenge)
      .set({ consumedAt: new Date() })
      .where('id = :id AND "consumedAt" IS NULL', { id: challenge.id })
      .execute();
    if (!consumed.affected) {
      throw this.invalidCode();
    }

    let user = await this.users.findOneBy({ phone });
    if (!user) {
      try {
        user = await this.users.save(
          this.users.create({ phone, role: 'CUSTOMER' }),
        );
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') {
          throw error;
        }
        user = await this.users.findOneByOrFail({ phone });
      }
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account disabled');
    }
    user = await this.maybeBootstrapAdmin(user);
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const row = await this.refreshTokens.findOneBy({
      tokenHash: sha256(refreshToken),
    });
    if (!row) {
      throw new UnauthorizedException();
    }
    if (row.revokedAt) {
      // रद्द हो चुका Token दोबारा आया: चोरी का शक, पूरे अकाउंट के Tokens रद्द
      if (Date.now() - row.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        await this.revokeAllForUser(row.userId);
      }
      throw new UnauthorizedException();
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    const revoked = await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('id = :id AND "revokedAt" IS NULL', { id: row.id })
      .execute();
    if (!revoked.affected) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findOneBy({ id: row.userId });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('"tokenHash" = :hash AND "revokedAt" IS NULL', {
        hash: sha256(refreshToken),
      })
      .execute();
  }

  async me(userId: string): Promise<UserView> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return this.toView(user);
  }

  // सिर्फ़ ADMIN Role से। आख़िरी Admin को हटाना मना है। Role बदलने पर पुराने Refresh Tokens रद्द।
  async setRole(userId: string, role: Role): Promise<UserView> {
    if (role === 'ADMIN') {
      const result = await this.users.update({ id: userId }, { role });
      if (!result.affected) {
        throw new NotFoundException('User not found');
      }
    } else {
      // जाँच और बदलाव एक ही कमांड में: कम से कम एक और Admin बचा हो तभी बदलो
      const result = await this.users
        .createQueryBuilder()
        .update(User)
        .set({ role })
        .where(
          `id = :id AND ("role" <> 'ADMIN' OR (SELECT count(*) FROM users WHERE "role" = 'ADMIN') > 1)`,
          { id: userId },
        )
        .execute();
      if (!result.affected) {
        const exists = await this.users.findOneBy({ id: userId });
        if (!exists) {
          throw new NotFoundException('User not found');
        }
        throw new ConflictException('Cannot remove the last admin');
      }
    }
    await this.revokeAllForUser(userId);
    return this.toView(await this.users.findOneByOrFail({ id: userId }));
  }

  // सर्वर की गुप्त सेटिंग (BOOTSTRAP_ADMIN_PHONE या BOOTSTRAP_ADMIN_EMAIL) वाला व्यक्ति Login करे,
  // और अभी कोई भी Admin न हो, तभी वह पहला Admin बनता है। एक ही कमांड में जाँच और बदलाव।
  // ईमेल तभी मिलता है जब Google ने उसे सत्यापित बताया हो (google-verifier में जाँचा जाता है)।
  private async maybeBootstrapAdmin(user: User): Promise<User> {
    if (user.role === 'ADMIN') {
      return user;
    }
    const phone = this.config.get<string>('BOOTSTRAP_ADMIN_PHONE');
    const email = this.config
      .get<string>('BOOTSTRAP_ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    const phoneMatches = !!phone && phone === user.phone;
    const emailMatches =
      !!email && !!user.email && email === user.email.toLowerCase();
    if (!phoneMatches && !emailMatches) {
      return user;
    }
    const result = await this.users
      .createQueryBuilder()
      .update(User)
      .set({ role: 'ADMIN' })
      .where(
        `id = :id AND NOT EXISTS (SELECT 1 FROM users WHERE "role" = 'ADMIN')`,
        { id: user.id },
      )
      .execute();
    if (!result.affected) {
      return user;
    }
    return this.users.findOneByOrFail({ id: user.id });
  }

  private toView(user: User): UserView {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      role: user.role,
    };
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: ACCESS_TTL_SECONDS },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await this.refreshTokens.save(
      this.refreshTokens.create({
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      }),
    );
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TTL_SECONDS,
    };
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId AND "revokedAt" IS NULL', { userId })
      .execute();
  }

  private hashOtp(phone: string, code: string): string {
    return createHmac('sha256', requireSecret(this.config, 'OTP_PEPPER'))
      .update(`${phone}:${code}`)
      .digest('hex');
  }

  // हर विफलता का एक ही जवाब: ग़लत, ख़त्म या पहले इस्तेमाल हुआ, बाहर से पता न चले
  private invalidCode(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired code');
  }
}
