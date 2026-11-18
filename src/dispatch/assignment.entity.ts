import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AssignmentStatus =
  | 'OFFERED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED';

@Entity('assignments')
// एक Order पर एक ही समय में एक ही "सक्रिय" (OFFERED या ACCEPTED) सौंपना हो सकता है
@Index('uq_assignments_active_order', ['orderId'], {
  unique: true,
  where: `"status" IN ('OFFERED', 'ACCEPTED')`,
})
// एक Partner के पास एक समय में एक ही सक्रिय Order (शुरुआती सीमा)
@Index('uq_assignments_active_partner', ['partnerId'], {
  unique: true,
  where: `"status" IN ('OFFERED', 'ACCEPTED')`,
})
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  orderId!: string;

  @Column({ type: 'uuid' })
  partnerId!: string;

  @Column({ type: 'varchar', length: 20, default: 'OFFERED' })
  status!: AssignmentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
