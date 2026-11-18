import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './order.entity';

// सूची में ग्राहक का नाम, फ़ोन और पता जानबूझकर नहीं
export interface OrderSummary {
  id: string;
  storeId: string;
  status: OrderStatus;
  totalPaise: number;
  createdAt: Date;
}

@Injectable()
export class OrderAdminService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async list(
    status: OrderStatus | undefined,
    limit: number,
  ): Promise<OrderSummary[]> {
    const rows = await this.orders.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: limit,
      select: {
        id: true,
        storeId: true,
        status: true,
        totalPaise: true,
        createdAt: true,
      },
    });
    return rows.map((o) => ({
      id: o.id,
      storeId: o.storeId,
      status: o.status,
      totalPaise: o.totalPaise,
      createdAt: o.createdAt,
    }));
  }
}
