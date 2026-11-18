import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string;
}
