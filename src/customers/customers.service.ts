import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Address } from './address.entity';
import { CustomerProfile } from './customer-profile.entity';
import { CreateAddressDto } from './dto/address.dto';
import { UpsertProfileDto } from './dto/profile.dto';

const MAX_ADDRESSES = 10;

export interface AddressView {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  area: string;
  landmark: string | null;
  city: string;
  pincode: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
  // Order के `deliveryAddress` में सीधे भेजने लायक पूरा पता (500 अक्षर के भीतर)
  formatted: string;
}

export interface ProfileView {
  name: string | null;
  contactPhone: string | null;
  contactPhoneVerified: boolean;
}

const formatAddress = (a: Address): string =>
  `${a.line1}, ${a.line2 ? `${a.line2}, ` : ''}${a.area}, ${a.city} - ${a.pincode}${
    a.landmark ? ` (Near ${a.landmark})` : ''
  }`;

const toView = (a: Address): AddressView => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  line2: a.line2,
  area: a.area,
  landmark: a.landmark,
  city: a.city,
  pincode: a.pincode,
  lat: a.lat,
  lng: a.lng,
  isDefault: a.isDefault,
  formatted: formatAddress(a),
});

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    @InjectRepository(CustomerProfile)
    private readonly profiles: Repository<CustomerProfile>,
    private readonly dataSource: DataSource,
  ) {}

  async listAddresses(userId: string): Promise<AddressView[]> {
    const rows = await this.addresses.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
    return rows.map(toView);
  }

  async createAddress(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressView> {
    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw new BadRequestException('lat and lng must be given together');
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lock(manager, userId);
        const repo = manager.getRepository(Address);
        const count = await repo.count({ where: { userId } });
        if (count >= MAX_ADDRESSES) {
          throw new ConflictException(
            `You can save at most ${MAX_ADDRESSES} addresses`,
          );
        }
        const saved = await repo.save(
          repo.create({
            userId,
            label: dto.label ?? 'Home',
            line1: dto.line1,
            line2: dto.line2 ?? null,
            area: dto.area,
            landmark: dto.landmark ?? null,
            city: dto.city ?? 'Goa',
            pincode: dto.pincode,
            lat: dto.lat ?? null,
            lng: dto.lng ?? null,
            // पहला पता अपने-आप डिफ़ॉल्ट
            isDefault: count === 0,
          }),
        );
        return toView(saved);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Please try again');
      }
      throw error;
    }
  }

  async removeAddress(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lock(manager, userId);
      const repo = manager.getRepository(Address);
      const own = await repo.findOneBy({ id, userId });
      if (!own) {
        throw new NotFoundException('Address not found');
      }
      await repo.delete({ id, userId });
      // डिफ़ॉल्ट हटा तो सबसे पुराना बचा हुआ पता डिफ़ॉल्ट बने
      if (own.isDefault) {
        const next = await repo.findOne({
          where: { userId },
          order: { createdAt: 'ASC' },
        });
        if (next) {
          await repo.update({ id: next.id }, { isDefault: true });
        }
      }
    });
  }

  async setDefault(userId: string, id: string): Promise<AddressView> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lock(manager, userId);
        const repo = manager.getRepository(Address);
        const own = await repo.findOneBy({ id, userId });
        if (!own) {
          throw new NotFoundException('Address not found');
        }
        if (!own.isDefault) {
          await repo.update({ userId, isDefault: true }, { isDefault: false });
          await repo.update({ id }, { isDefault: true });
          own.isDefault = true;
        }
        return toView(own);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Please try again');
      }
      throw error;
    }
  }

  async getProfile(userId: string): Promise<ProfileView> {
    const row = await this.profiles.findOneBy({ userId });
    return {
      name: row?.name ?? null,
      contactPhone: row?.contactPhone ?? null,
      contactPhoneVerified: false,
    };
  }

  async upsertProfile(
    userId: string,
    dto: UpsertProfileDto,
  ): Promise<ProfileView> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const current =
          (await this.profiles.findOneBy({ userId })) ??
          this.profiles.create({ userId, name: null, contactPhone: null });
        if (dto.name !== undefined) {
          current.name = dto.name;
        }
        if (dto.contactPhone !== undefined) {
          current.contactPhone = dto.contactPhone;
        }
        const saved = await this.profiles.save(current);
        return {
          name: saved.name,
          contactPhone: saved.contactPhone,
          contactPhoneVerified: false,
        };
      } catch (error) {
        // पहली बार दो माँगें एक साथ आईं: दोबारा कोशिश
        if ((error as { code?: string }).code !== '23505' || attempt === 1) {
          throw error;
        }
      }
    }
    throw new ConflictException('Please try again');
  }

  // एक ही ग्राहक के पतों पर काम एक-एक करके (सीमा और डिफ़ॉल्ट सुरक्षित रहें)
  private async lock(manager: EntityManager, userId: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `addr:${userId}`,
    ]);
  }
}
