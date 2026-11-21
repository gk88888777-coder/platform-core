import {
  Check,
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CallOutcome = 'CONFIRMED' | 'NO_ANSWER' | 'DENIED';

// Order की मुख्य तालिका नहीं बदली: टीम का काम अलग तालिका में
@Entity('order_ops')
@Check(`"callOutcome" IN ('CONFIRMED','NO_ANSWER','DENIED')`)
export class OrderOps {
  @PrimaryColumn({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'varchar', length: 20 })
  callOutcome!: CallOutcome;

  @Column({ type: 'uuid' })
  calledByUserId!: string;

  // यहाँ फ़ोन नंबर या पता न लिखें
  @Column({ type: 'varchar', length: 300, nullable: true })
  note!: string | null;

  @Column({ type: 'integer', default: 1 })
  attempts!: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
