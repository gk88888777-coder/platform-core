import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type Direction = 'DEBIT' | 'CREDIT';

// बही सिर्फ़ जुड़ती है: इसमें कोई प्रविष्टि बदली या मिटाई नहीं जाती।
// (असली Database में Migration के समय बदलाव और मिटाने पर रोक भी लगेगी।)
@Entity('ledger_entries')
@Check('"amountPaise" > 0')
@Check(`"direction" IN ('DEBIT','CREDIT')`)
// एक घटना पर एक खाते की एक ही प्रविष्टि: घटना दोबारा चले तो दोहरी प्रविष्टि नहीं
@Index('uq_ledger_event_account', ['eventId', 'account'], {
  unique: true,
  where: '"eventId" IS NOT NULL',
})
export class LedgerEntry {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  // एक लेन-देन की सारी प्रविष्टियाँ एक groupId से जुड़ी होती हैं
  @Index()
  @Column({ type: 'uuid' })
  groupId!: string;

  @Column({ type: 'uuid', nullable: true })
  eventId!: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  orderId!: string | null;

  // हाथ से दर्ज करने वाला Admin (जमा, भुगतान)
  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  account!: string;

  @Column({ type: 'varchar', length: 10 })
  direction!: Direction;

  // पैसे में, हमेशा धनात्मक पूर्णांक
  @Column({ type: 'integer' })
  amountPaise!: number;

  @Column({ type: 'varchar', length: 30 })
  kind!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
