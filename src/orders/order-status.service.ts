import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { OrderItem } from './order-item.entity';
import { Order, OrderStatus } from './order.entity';

export type OrderStep = 'accept' | 'pack' | 'dispatch' | 'deliver';

const STEPS: Record<OrderStep, { from: OrderStatus; to: OrderStatus }> = {
  accept: { from: 'CREATED', to: 'ACCEPTED' },
  pack: { from: 'ACCEPTED', to: 'PACKED' },
  dispatch: { from: 'PACKED', to: 'OUT_FOR_DELIVERY' },
  deliver: { from: 'OUT_FOR_DELIVERY', to: 'DELIVERED' },
};

// डिलीवरी पर निकलने से पहले तक ही रद्द हो सकता है
const CANCELLABLE: OrderStatus[] = ['CREATED', 'ACCEPTED', 'PACKED'];

export interface OrderStatusView {
  id: string;
  status: OrderStatus;
}

@Injectable()
export class OrderStatusService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
  ) {}

  async advance(id: string, step: OrderStep): Promise<OrderStatusView> {
    const rule = STEPS[step];
    // जाँच और बदलाव एक ही कमांड में: दो माँगें एक साथ आएँ तो एक ही सफल होगी
    const result = await this.dataSource
      .getRepository(Order)
      .update({ id, status: rule.from }, { status: rule.to });
    if (!result.affected) {
      await this.explainFailure(id, this.dataSource.manager, rule.from);
    }
    return { id, status: rule.to };
  }

  async cancel(id: string, reason: string): Promise<OrderStatusView> {
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        Order,
        { id, status: In(CANCELLABLE) },
        { status: 'CANCELLED', cancelReason: reason },
      );
      if (!result.affected) {
        await this.explainFailure(id, manager, 'CREATED, ACCEPTED or PACKED');
      }

      const items = await manager.find(OrderItem, { where: { orderId: id } });
      items.sort((a, b) => a.productId.localeCompare(b.productId));
      for (const item of items) {
        await this.catalog.restoreStock(item.productId, item.qty, manager);
      }
    });
    return { id, status: 'CANCELLED' };
  }

  private async explainFailure(
    id: string,
    manager: EntityManager,
    expected: string,
  ): Promise<never> {
    const order = await manager.findOne(Order, {
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    throw new ConflictException(
      `Order is ${order.status}; this action needs ${expected}`,
    );
  }
}
