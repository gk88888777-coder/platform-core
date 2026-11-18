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
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  phone!: string;

  @Column({ type: 'varchar', length: 20, default: 'CUSTOMER' })
  role!: Role;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
