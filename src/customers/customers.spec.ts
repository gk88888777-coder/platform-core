import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseModule } from '../database/database.module';
import { Address } from './address.entity';
import { CustomersModule } from './customers.module';
import { CustomersService } from './customers.service';
import { CreateAddressDto } from './dto/address.dto';

// Database उपलब्ध हो तभी चलता है (GitHub CI में)।
const suite = process.env.POSTGRES_HOST ? describe : describe.skip;

suite('Customer addresses and profile (integration)', () => {
  jest.setTimeout(30000);

  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let customers: CustomersService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        CustomersModule,
      ],
    }).compile();
    dataSource = moduleRef.get(DataSource);
    customers = moduleRef.get(CustomersService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const dto = (line1: string): CreateAddressDto => ({
    line1,
    area: 'Calangute',
    pincode: '403516',
  });

  const defaultsOf = (userId: string): Promise<number> =>
    dataSource.getRepository(Address).countBy({ userId, isDefault: true });

  it('makes the first address the default and not the second', async () => {
    const user = randomUUID();
    const first = await customers.createAddress(user, dto('House 11, Beach Road'));
    const second = await customers.createAddress(user, dto('House 22, Beach Road'));
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
    expect(first.formatted).toContain('Calangute, Goa - 403516');
  });

  it('switches the default and keeps exactly one', async () => {
    const user = randomUUID();
    await customers.createAddress(user, dto('House 11, Beach Road'));
    const second = await customers.createAddress(user, dto('House 22, Beach Road'));
    const switched = await customers.setDefault(user, second.id);
    expect(switched.isDefault).toBe(true);
    expect(await defaultsOf(user)).toBe(1);
    const list = await customers.listAddresses(user);
    expect(list[0].id).toBe(second.id);
  });

  it('allows at most ten addresses', async () => {
    const user = randomUUID();
    for (let i = 0; i < 10; i += 1) {
      await customers.createAddress(user, dto(`House ${i}0, Beach Road`));
    }
    await expect(
      customers.createAddress(user, dto('House 99, Beach Road')),
    ).rejects.toThrow(ConflictException);
  });

  it('never shows or changes another customer\'s address', async () => {
    const owner = randomUUID();
    const other = randomUUID();
    const address = await customers.createAddress(owner, dto('House 11, Beach Road'));

    expect(await customers.listAddresses(other)).toEqual([]);
    await expect(customers.removeAddress(other, address.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(customers.setDefault(other, address.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(await customers.listAddresses(owner)).toHaveLength(1);
  });

  it('promotes the oldest remaining address when the default is removed', async () => {
    const user = randomUUID();
    const first = await customers.createAddress(user, dto('House 11, Beach Road'));
    const second = await customers.createAddress(user, dto('House 22, Beach Road'));
    await customers.createAddress(user, dto('House 33, Beach Road'));

    await customers.removeAddress(user, first.id);
    const list = await customers.listAddresses(user);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.id);
    expect(list[0].isDefault).toBe(true);
    expect(await defaultsOf(user)).toBe(1);
  });

  it('refuses a latitude without a longitude', async () => {
    await expect(
      customers.createAddress(randomUUID(), { ...dto('House 11, Beach Road'), lat: 15.5 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('starts with an empty, unverified profile', async () => {
    const profile = await customers.getProfile(randomUUID());
    expect(profile).toEqual({
      name: null,
      contactPhone: null,
      contactPhoneVerified: false,
    });
  });

  it('updates the profile partially without losing the other field', async () => {
    const user = randomUUID();
    await customers.upsertProfile(user, { name: 'Asha' });
    const updated = await customers.upsertProfile(user, {
      contactPhone: '+919876543210',
    });
    expect(updated.name).toBe('Asha');
    expect(updated.contactPhone).toBe('+919876543210');
    expect(updated.contactPhoneVerified).toBe(false);
  });
});
