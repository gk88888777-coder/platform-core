import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

export type OrderStatus = 'CREATED' | 'CANCELLED';

@Entity('orders')
@Check('"totalPaise" >= 0')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  storeId!: string;

  @Column({ type: 'varchar', length: 100 })
  customerName!: string;

  @Column({ type: 'varchar', length: 20 })
  customerPhone!: string;

  @Column({ type: 'varchar', length: 500 })
  deliveryAddress!: string;

  @Column({ type: 'varchar', length: 20, default: 'CREATED' })
  status!: OrderStatus;

  @Column({ type: 'varchar', length: 10, default: 'COD' })
  paymentMethod!: string;

  @Column({ type: 'integer' })
  subtotalPaise!: number;

  @Column({ type: 'integer' })
  deliveryFeePaise!: number;

  @Column({ type: 'integer' })
  totalPaise!: number;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  idempotencyKey!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestHash!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items!: Relation<OrderItem[]>;
}
