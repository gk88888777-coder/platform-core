import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

// अस्थायी: असली SMS सेवा जुड़ने पर इसकी जगह वह आएगी।
@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSender.name);

  async send(phone: string, code: string): Promise<void> {
    if (process.env.OTP_DEV_LOG !== 'true') {
      throw new ServiceUnavailableException('OTP delivery is not configured');
    }
    this.logger.warn(`DEV ONLY: OTP for ${phone} is ${code}`);
  }
}
