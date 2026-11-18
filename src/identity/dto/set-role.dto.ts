import { IsIn } from 'class-validator';
import { ROLES, Role } from '../user.entity';

export class SetRoleDto {
  @IsIn(ROLES)
  role!: Role;
}
