import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PriceQuote {
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
}

// डिलीवरी शुल्क का एकमात्र ठिकाना। नियम बदलने हों तो सिर्फ़ यही फ़ाइल।
// Requires Business Decision: शुल्क और "इतने से ऊपर मुफ़्त" की रक़म।
@Injectable()
export class PricingService {
  constructor(private readonly config: ConfigService) {}

  quote(subtotalPaise: number): PriceQuote {
    const fee = this.setting('DELIVERY_FEE_PAISE', 2000, 0, 100000);
    const freeAbove = this.setting('FREE_DELIVERY_ABOVE_PAISE', 0, 0, 100000000);
    const deliveryFeePaise =
      freeAbove > 0 && subtotalPaise >= freeAbove ? 0 : fee;
    return {
      subtotalPaise,
      deliveryFeePaise,
      totalPaise: subtotalPaise + deliveryFeePaise,
    };
  }

  private setting(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const raw = this.config.get<string>(name);
    if (raw === undefined || raw.trim() === '') {
      return fallback;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  }
}
