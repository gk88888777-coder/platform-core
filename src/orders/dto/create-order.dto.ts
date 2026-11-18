import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OrderLineDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(50)
  qty!: number;
}

export class CreateOrderDto {
  @IsUUID()
  storeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customerName!: string;

  // भारतीय और विदेशी, दोनों नंबर (पर्यटकों के लिए)
  @Matches(/^\+?[0-9]{8,15}$/)
  customerPhone!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  deliveryAddress!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];
}
