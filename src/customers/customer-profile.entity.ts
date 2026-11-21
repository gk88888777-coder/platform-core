import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('customer_profiles')
export class CustomerProfile {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;

  // ग्राहक का ख़ुद लिखा संपर्क नंबर: असत्यापित
  @Column({ type: 'varchar', length: 20, nullable: true })
  contactPhone!: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
