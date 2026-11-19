import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { Assignment } from './assignment.entity';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { Partner } from './partner.entity';
import { PartnerController } from './partner.controller';

// Delivery Partner को Order सौंपना।
@Module({
  imports: [TypeOrmModule.forFeature([Partner, Assignment]), IdentityModule],
  controllers: [DispatchController, PartnerController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
