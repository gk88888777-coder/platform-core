import { IsInt, Max, Min } from 'class-validator';

export class SetStockDto {
  @IsInt()
  @Min(0)
  @Max(100000)
  stockQty!: number;
}
