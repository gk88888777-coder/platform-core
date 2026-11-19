import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('stores')
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  // इस दुकान का मालिक (Login वाला MERCHANT अकाउंट)
  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
