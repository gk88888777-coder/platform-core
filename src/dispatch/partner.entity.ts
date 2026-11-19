import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // इस Partner प्रोफ़ाइल से जुड़ा Login वाला अकाउंट (एक अकाउंट, एक Partner)
  @Column({ type: 'uuid', nullable: true, unique: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'boolean', default: false })
  isOnline!: boolean;

  // Admin ने सत्यापित किया या नहीं (KYC जाँच के बाद true)
  @Column({ type: 'boolean', default: false })
  isVerified!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
