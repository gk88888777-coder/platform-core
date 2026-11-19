import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Assignment } from './assignment.entity';
import { Partner } from './partner.entity';

// क्या इस Login वाले Partner ने इसी Order को स्वीकार किया है?
@Injectable()
export class PartnerAccessService {
  constructor(
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
  ) {}

  async partnerHasAcceptedOrder(
    userId: string,
    orderId: string,
  ): Promise<boolean> {
    const count = await this.assignments
      .createQueryBuilder('a')
      .innerJoin(Partner, 'p', 'p.id = a."partnerId"')
      .where(
        `a."orderId" = :orderId AND a."status" = 'ACCEPTED' AND p."userId" = :userId`,
        { orderId, userId },
      )
      .getCount();
    return count > 0;
  }
}
