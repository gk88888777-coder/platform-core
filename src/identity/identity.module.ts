import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUsersController } from './admin-users.controller';
import { requireSecret } from './auth-config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GOOGLE_VERIFIER, GoogleLibraryVerifier } from './google-verifier';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MeController } from './me.controller';
import { OtpChallenge } from './otp-challenge.entity';
import { ConsoleOtpSender, OTP_SENDER } from './otp-sender';
import { RefreshToken } from './refresh-token.entity';
import { RolesGuard } from './roles.guard';
import { User } from './user.entity';

// लॉगिन (Google और OTP) और Roles।
@Module({
  imports: [
    TypeOrmModule.forFeature([User, OtpChallenge, RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireSecret(config, 'JWT_SECRET'),
        signOptions: { algorithm: 'HS256' as const },
      }),
    }),
  ],
  controllers: [AuthController, MeController, AdminUsersController],
  providers: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
    { provide: GOOGLE_VERIFIER, useClass: GoogleLibraryVerifier },
  ],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class IdentityModule {}
