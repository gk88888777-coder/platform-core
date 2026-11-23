import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('notifications')
// एक घटना पर एक व्यक्ति को एक ही सूचना: दोबारा चलने पर दोहराव नहीं
@Index('uq_notifications_event_user', ['eventId', 'userId'], {
  unique: true,
  where: '"eventId" IS NOT NULL',
})
@Index('ix_notifications_user_time', ['userId', 'createdAt'])
export class Notification {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null;

  // ऐप इसी कोड से भाषा (हिंदी, अंग्रेज़ी, कोंकणी) चुनेगा
  @Column({ type: 'varchar', length: 40 })
  type!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  // यहाँ फ़ोन या पता कभी नहीं
  @Column({ type: 'varchar', length: 300 })
  body!: string;

  @Column({ type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
