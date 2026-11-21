import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  label?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(150)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  line2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  area!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  landmark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @Matches(/^[1-9][0-9]{5}$/)
  pincode!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}
