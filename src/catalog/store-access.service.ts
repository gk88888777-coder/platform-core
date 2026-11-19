import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../identity/user.entity';
import { Store } from './store.entity';

// दुकान का मालिक कौन है: जोड़ना और जाँचना
@Injectable()
export class StoreAccessService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  async linkOwner(
    storeId: string,
    userId: string,
  ): Promise<{ id: string; ownerUserId: string }> {
    const user = await this.stores.manager
      .getRepository(User)
      .findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== 'MERCHANT') {
      throw new ConflictException('User must have the MERCHANT role first');
    }
    const result = await this.stores.update(
      { id: storeId },
      { ownerUserId: userId },
    );
    if (!result.affected) {
      throw new NotFoundException('Store not found');
    }
    return { id: storeId, ownerUserId: userId };
  }

  async isStoreOwner(storeId: string, userId: string): Promise<boolean> {
    return (
      (await this.stores.count({ where: { id: storeId, ownerUserId: userId } })) >
      0
    );
  }

  async storeIdsOwnedBy(userId: string): Promise<string[]> {
    const rows = await this.stores.find({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
