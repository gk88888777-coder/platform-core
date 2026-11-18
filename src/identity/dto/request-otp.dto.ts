import { Matches } from 'class-validator';

// देश-कोड के साथ: +9198xxxxxxxx
export const E164 = /^\+[1-9][0-9]{7,14}$/;

export class RequestOtpDto {
  @Matches(E164)
  phone!: string;
}
