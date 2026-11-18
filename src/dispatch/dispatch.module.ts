import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from './assignment.entity';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { Partner } from './partner.entity';

// Delivery Partner को Order सौंपना।
@Module({
  imports: [TypeOrmModule.forFeature([Partner, Assignment])],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
