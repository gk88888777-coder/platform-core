import {
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  // पैसे में (₹10.50 = 1050)
  @IsInt()
  @Min(0)
  @Max(10000000)
  pricePaise!: number;

  @IsInt()
  @Min(0)
  @Max(100000)
  stockQty!: number;
}
