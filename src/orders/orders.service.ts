import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItem } from './order-item.entity';
import { Order } from './order.entity';

// अस्थायी ₹20: Requires Business Decision
const DELIVERY_FEE_PAISE = 2000;

export interface OrderView {
  id: string;
  storeId: string;
  status: string;
  paymentMethod: string;
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  createdAt: Date;
  items: {
    productId: string;
    productName: string;
    unitPricePaise: number;
    qty: number;
  }[];
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
  ) {}

  async create(
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<OrderView> {
    // एक ही सामान दो बार आए तो मात्राएँ जोड़ दो
    const wanted = new Map<string, number>();
    for (const line of dto.items) {
      wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.qty);
    }

    const lines = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b));
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          storeId: dto.storeId,
          name: dto.customerName,
          phone: dto.customerPhone,
          address: dto.deliveryAddress,
          lines,
        }),
      )
      .digest('hex');

    if (idempotencyKey) {
      const existing = await this.findByKey(idempotencyKey);
      if (existing) {
        return this.replay(existing, requestHash);
      }
    }

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const products = await this.catalog.findForOrder(
          dto.storeId,
          [...wanted.keys()],
          manager,
        );
        if (products.length !== wanted.size) {
          throw new BadRequestException('One or more items are unavailable');
        }

        // हमेशा एक ही क्रम में Stock घटाओ, ताकि आपसी अटकाव (deadlock) न हो
        products.sort((a, b) => a.id.localeCompare(b.id));

        const items: OrderItem[] = [];
        let subtotal = 0;
        for (const product of products) {
          const qty = wanted.get(product.id) as number;
          const reserved = await this.catalog.reserveStock(
            product.id,
            qty,
            manager,
          );
          if (!reserved) {
            throw new ConflictException(`Not enough stock: ${product.name}`);
          }
          subtotal += product.pricePaise * qty;
          items.push(
            manager.create(OrderItem, {
              productId: product.id,
              productName: product.name,
              unitPricePaise: product.pricePaise,
              qty,
            }),
          );
        }

        const entity = manager.create(Order, {
          storeId: dto.storeId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          deliveryAddress: dto.deliveryAddress,
          status: 'CREATED',
          paymentMethod: 'COD',
          subtotalPaise: subtotal,
          deliveryFeePaise: DELIVERY_FEE_PAISE,
          totalPaise: subtotal + DELIVERY_FEE_PAISE,
          idempotencyKey: idempotencyKey ?? null,
          requestHash,
          items,
        });
        return manager.save(entity);
      });
      return this.toView(saved);
    } catch (error) {
      // दो एक जैसी माँगें एक साथ आईं: Database ने दोहराव रोका
      if (idempotencyKey && (error as { code?: string }).code === '23505') {
        const existing = await this.findByKey(idempotencyKey);
        if (existing) {
          return this.replay(existing, requestHash);
        }
      }
      throw error;
    }
  }

  async getForAdmin(id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private findByKey(idempotencyKey: string): Promise<Order | null> {
    return this.orders.findOne({
      where: { idempotencyKey },
      relations: { items: true },
    });
  }

  // वही Key पर अलग माँग आए तो मना: किसी का पुराना Order दूसरा न पढ़ सके
  private replay(existing: Order, requestHash: string): OrderView {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key was already used with a different request',
      );
    }
    return this.toView(existing);
  }

  private toView(order: Order): OrderView {
    return {
      id: order.id,
      storeId: order.storeId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      subtotalPaise: order.subtotalPaise,
      deliveryFeePaise: order.deliveryFeePaise,
      totalPaise: order.totalPaise,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        unitPricePaise: item.unitPricePaise,
        qty: item.qty,
      })),
    };
  }
}
