import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_items')
@Check('"qty" > 0')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Relation<Order>;

  // जानबूझकर Products तालिका से सीधा रिश्ता नहीं: कमरों की सीमा बनी रहे
  @Column({ type: 'uuid' })
  productId!: string;

  // Order के समय का नाम और दाम सहेजा जाता है, ताकि बाद में दाम बदलने पर पुराना Order न बदले
  @Column({ type: 'varchar', length: 200 })
  productName!: string;

  @Column({ type: 'integer' })
  unitPricePaise!: number;

  @Column({ type: 'integer' })
  qty!: number;
}
