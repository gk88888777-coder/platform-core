import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CallResultDto {
  @IsIn(['CONFIRMED', 'NO_ANSWER', 'DENIED'])
  outcome!: 'CONFIRMED' | 'NO_ANSWER' | 'DENIED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
