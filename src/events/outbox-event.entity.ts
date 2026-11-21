import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

// हर घटना Order के बदलाव के साथ उसी Transaction में दर्ज होती है, इसलिए खोती नहीं।
@Entity('outbox_events')
@Index('ix_outbox_pending', ['createdAt'], { where: '"processedAt" IS NULL' })
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  type!: string;

  @Index()
  @Column({ type: 'uuid' })
  aggregateId!: string;

  // निजी जानकारी (फ़ोन, पता) इसमें कभी नहीं
  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'boolean', default: false })
  failed!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
