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

export type OrderStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'PACKED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

@Entity('orders')
@Check('"totalPaise" >= 0')
// एक ग्राहक की एक Key से एक ही Order
@Index(['customerId', 'idempotencyKey'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  storeId!: string;

  // Order बनाने वाला (Login वाला उपयोगकर्ता)
  @Index()
  @Column({ type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  customerName!: string;

  @Column({ type: 'varchar', length: 20 })
  customerPhone!: string;

  // क्या यह नंबर उसी अकाउंट का OTP से जाँचा हुआ नंबर है
  @Column({ type: 'boolean', default: false })
  customerPhoneVerified!: boolean;

  // नया ग्राहक और असत्यापित फ़ोन: टीम को पहले Order पर कॉल करके पक्का करना है
  @Column({ type: 'boolean', default: false })
  needsConfirmationCall!: boolean;

  @Column({ type: 'varchar', length: 500 })
  deliveryAddress!: string;

  @Column({ type: 'varchar', length: 20, default: 'CREATED' })
  status!: OrderStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  cancelReason!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'COD' })
  paymentMethod!: string;

  @Column({ type: 'integer' })
  subtotalPaise!: number;

  @Column({ type: 'integer' })
  deliveryFeePaise!: number;

  @Column({ type: 'integer' })
  totalPaise!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  requestHash!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items!: Relation<OrderItem[]>;
}
