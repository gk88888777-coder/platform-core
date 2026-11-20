import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type Role = 'CUSTOMER' | 'PARTNER' | 'MERCHANT' | 'ADMIN';
export const ROLES: Role[] = ['CUSTOMER', 'PARTNER', 'MERCHANT', 'ADMIN'];

@Entity('users')
@Check(`"role" IN ('CUSTOMER','PARTNER','MERCHANT','ADMIN')`)
// हर अकाउंट के पास कम से कम एक पहचान ज़रूर हो: फ़ोन या Google
@Check(`"phone" IS NOT NULL OR "googleSub" IS NOT NULL`)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // फ़ोन अब वैकल्पिक है (Google से आने वालों के पास नहीं होता); होने पर अनोखा
  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone!: string | null;

  // Google की स्थायी पहचान (ईमेल बदल सकता है, यह नहीं)
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  googleSub!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'CUSTOMER' })
  role!: Role;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
