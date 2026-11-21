import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '../identity/identity.module';
import { Address } from './address.entity';
import { CustomerProfile } from './customer-profile.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

// ग्राहक के सहेजे पते और प्रोफ़ाइल।
@Module({
  imports: [
    TypeOrmModule.forFeature([Address, CustomerProfile]),
    IdentityModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
