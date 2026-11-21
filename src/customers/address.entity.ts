import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('addresses')
// एक ग्राहक का एक ही डिफ़ॉल्ट पता: Database ख़ुद पक्का करता है
@Index('uq_addresses_default_per_user', ['userId'], {
  unique: true,
  where: '"isDefault" = true',
})
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 30 })
  label!: string;

  @Column({ type: 'varchar', length: 150 })
  line1!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  line2!: string | null;

  @Column({ type: 'varchar', length: 80 })
  area!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  landmark!: string | null;

  @Column({ type: 'varchar', length: 50 })
  city!: string;

  @Column({ type: 'varchar', length: 6 })
  pincode!: string;

  // आगे की Location-व्यवस्था के लिए अभी से जगह (वैकल्पिक)
  @Column({ type: 'double precision', nullable: true })
  lat!: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng!: number | null;

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
