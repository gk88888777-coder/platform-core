import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StoreAccessService } from '../catalog/store-access.service';
import { Order, OrderStatus } from './order.entity';

// सूची में ग्राहक का नाम, फ़ोन और पता जानबूझकर नहीं
export interface OrderSummary {
  id: string;
  storeId: string;
  status: OrderStatus;
  totalPaise: number;
  customerPhoneVerified: boolean;
  needsConfirmationCall: boolean;
  createdAt: Date;
}

// दुकानदार को सिर्फ़ सामान और रक़म: ग्राहक की निजी जानकारी नहीं
export interface MerchantOrderView {
  id: string;
  status: OrderStatus;
  totalPaise: number;
  createdAt: Date;
  items: { productName: string; qty: number }[];
}

@Injectable()
export class OrderAdminService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly stores: StoreAccessService,
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
        customerPhoneVerified: true,
        needsConfirmationCall: true,
        createdAt: true,
      },
    });
    return rows.map((o) => ({
      id: o.id,
      storeId: o.storeId,
      status: o.status,
      totalPaise: o.totalPaise,
      customerPhoneVerified: o.customerPhoneVerified,
      needsConfirmationCall: o.needsConfirmationCall,
      createdAt: o.createdAt,
    }));
  }

  // दुकानदार: सिर्फ़ अपनी दुकानों के Orders
  async listForMerchant(
    userId: string,
    status: OrderStatus | undefined,
    limit: number,
  ): Promise<MerchantOrderView[]> {
    const storeIds = await this.stores.storeIdsOwnedBy(userId);
    if (storeIds.length === 0) {
      return [];
    }
    const storeFilter = { storeId: In(storeIds) };
    const rows = await this.orders.find({
      where: status ? { ...storeFilter, status } : storeFilter,
      relations: { items: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((o) => ({
      id: o.id,
      status: o.status,
      totalPaise: o.totalPaise,
      createdAt: o.createdAt,
      items: o.items.map((item) => ({
        productName: item.productName,
        qty: item.qty,
      })),
    }));
  }
}
