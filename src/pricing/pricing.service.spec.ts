import { ConfigService } from '@nestjs/config';
import { PricingService } from './pricing.service';

const make = (values: Record<string, string>): PricingService =>
  new PricingService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);

describe('PricingService', () => {
  it('uses Rs 20 by default', () => {
    expect(make({}).quote(5000)).toEqual({
      subtotalPaise: 5000,
      deliveryFeePaise: 2000,
      totalPaise: 7000,
    });
  });

  it('uses the configured fee, including zero', () => {
    expect(make({ DELIVERY_FEE_PAISE: '1500' }).quote(5000).deliveryFeePaise).toBe(1500);
    expect(make({ DELIVERY_FEE_PAISE: '0' }).quote(5000).deliveryFeePaise).toBe(0);
  });

  it('makes delivery free at or above the threshold', () => {
    const service = make({ FREE_DELIVERY_ABOVE_PAISE: '30000' });
    expect(service.quote(29999).deliveryFeePaise).toBe(2000);
    expect(service.quote(30000).deliveryFeePaise).toBe(0);
  });

  it('falls back to the default for a wrong setting', () => {
    expect(make({ DELIVERY_FEE_PAISE: 'abc' }).quote(5000).deliveryFeePaise).toBe(2000);
    expect(make({ DELIVERY_FEE_PAISE: '-5' }).quote(5000).deliveryFeePaise).toBe(2000);
    expect(make({ DELIVERY_FEE_PAISE: '12.5' }).quote(5000).deliveryFeePaise).toBe(2000);
  });

  it('never changes the subtotal', () => {
    expect(make({}).quote(12345).subtotalPaise).toBe(12345);
  });
});
