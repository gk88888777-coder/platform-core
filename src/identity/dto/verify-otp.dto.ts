import { Matches } from 'class-validator';
import { E164 } from './request-otp.dto';

export class VerifyOtpDto {
  @Matches(E164)
  phone!: string;

  @Matches(/^[0-9]{6}$/)
  code!: string;
}
