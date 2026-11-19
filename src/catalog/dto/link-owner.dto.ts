import { IsUUID } from 'class-validator';

export class LinkOwnerDto {
  @IsUUID()
  userId!: string;
}
