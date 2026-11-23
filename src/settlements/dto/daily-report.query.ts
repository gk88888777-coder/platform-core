import { IsOptional, Matches } from 'class-validator';

export class DailyReportQueryDto {
  // YYYY-MM-DD (भारतीय समय का दिन); न दें तो आज
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
