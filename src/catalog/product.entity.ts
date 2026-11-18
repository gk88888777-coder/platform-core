import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('products')
@Check('"stockQty" >= 0')
@Check('"pricePaise" >= 0')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  storeId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  // दाम पैसे में (₹10.50 = 1050)। दशमलव कभी नहीं।
  @Column({ type: 'integer' })
  pricePaise!: number;

  @Column({ type: 'integer', default: 0 })
  stockQty!: number;

  @Column({ type: 'boolean', default: true })
  isAvailable!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
