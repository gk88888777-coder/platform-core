import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Matches(/^\+?[0-9]{8,15}$/)
  phone!: string;
}
