import { IsInt, Max, Min } from 'class-validator';

export class AmountDto {
  // पैसे में (Rs 10.50 = 1050)
  @IsInt()
  @Min(1)
  @Max(100000000)
  amountPaise!: number;
}
