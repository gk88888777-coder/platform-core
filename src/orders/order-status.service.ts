import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { DispatchService } from '../dispatch/dispatch.service';
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
    private readonly dispatch: DispatchService,
  ) {}

  async advance(id: string, step: OrderStep): Promise<OrderStatusView> {
    const rule = STEPS[step];
    await this.dataSource.transaction(async (manager) => {
      // जाँच और बदलाव एक ही कमांड में: दो माँगें एक साथ आएँ तो एक ही सफल होगी
      const result = await manager.update(
        Order,
        { id, status: rule.from },
        { status: rule.to },
      );
      if (!result.affected) {
        await this.explainFailure(id, manager, rule.from);
      }
      // किसी Partner के स्वीकार किए बिना Order डिलीवरी पर नहीं निकल सकता।
      // यहाँ त्रुटि आई तो ऊपर का बदलाव भी वापस हो जाता है।
      if (step === 'dispatch') {
        const accepted = await this.dispatch.hasAcceptedAssignment(id, manager);
        if (!accepted) {
          throw new ConflictException(
            'A delivery partner must accept this order first',
          );
        }
      }
      // डिलीवर होते ही Partner अगले काम के लिए मुक्त
      if (step === 'deliver') {
        await this.dispatch.closeForOrder(id, 'COMPLETED', manager);
      }
    });
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

      // रद्द Order का सौंपना बंद: Partner मुक्त, और वह इसे स्वीकार न कर सके
      await this.dispatch.closeForOrder(id, 'CANCELLED', manager);

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
