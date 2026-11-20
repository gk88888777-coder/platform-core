import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, In } from 'typeorm';
import { User } from '../identity/user.entity';
import { Order, OrderStatus } from './order.entity';

const OPEN_STATUSES: OrderStatus[] = [
  'CREATED',
  'ACCEPTED',
  'PACKED',
  'OUT_FOR_DELIVERY',
];

export interface CustomerStanding {
  isNew: boolean;
  openOrders: number;
  phoneVerified: boolean;
}

// नए ग्राहकों की सीमाएँ। सारे मान सेटिंग से बदले जा सकते हैं; ग़लत मान हो तो डिफ़ॉल्ट।
@Injectable()
export class OrderLimitsService {
  constructor(private readonly config: ConfigService) {}

  // जाँच से पहले उस ग्राहक के लिए Transaction-स्तर का ताला: एक ही ग्राहक के दो Orders
  // एक साथ आएँ तो पहला पूरा होने तक दूसरा रुकेगा, ताकि सीमा न टूटे।
  async assess(
    manager: EntityManager,
    customerId: string,
    orderPhone: string,
  ): Promise<CustomerStanding> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      customerId,
    ]);

    const orders = manager.getRepository(Order);
    const delivered = await orders.count({
      where: { customerId, status: 'DELIVERED' },
    });
    const openOrders = await orders.count({
      where: { customerId, status: In(OPEN_STATUSES) },
    });

    // फ़ोन वाला अकाउंट सिर्फ़ OTP Login से बनता है, इसलिए उसका नंबर जाँचा हुआ है।
    // Google वाले अकाउंट पर फ़ोन नहीं होता, इसलिए वहाँ यह हमेशा false रहेगा।
    const user = await manager.getRepository(User).findOne({
      where: { id: customerId },
      select: { id: true, phone: true },
    });
    const phoneVerified = !!user?.phone && user.phone === orderPhone;

    return {
      isNew: delivered < this.setting('ORDER_NEW_CUSTOMER_ORDERS', 3, 0, 1000),
      openOrders,
      phoneVerified,
    };
  }

  enforce(standing: CustomerStanding, totalPaise: number): void {
    const maxOpen = standing.isNew
      ? this.setting('ORDER_MAX_OPEN_NEW', 1, 1, 50)
      : this.setting('ORDER_MAX_OPEN_ESTABLISHED', 3, 1, 50);
    if (standing.openOrders >= maxOpen) {
      throw new ConflictException(
        'You already have an open order. Wait for it to be delivered or cancel it first.',
      );
    }

    if (standing.isNew) {
      // अभी सिर्फ़ COD है, इसलिए सीमा हर Order पर। ऑनलाइन भुगतान आने पर सिर्फ़ COD पर लगेगी।
      const cap = this.setting('ORDER_NEW_CUSTOMER_COD_CAP_PAISE', 50000, 100, 100000000);
      if (totalPaise > cap) {
        throw new UnprocessableEntityException(
          `Cash on delivery for new accounts is limited to Rs ${cap / 100}.`,
        );
      }
    }
  }

  needsConfirmationCall(standing: CustomerStanding): boolean {
    return standing.isNew && !standing.phoneVerified;
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
