import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../orders/order.entity';
import { Assignment } from './assignment.entity';
import { Partner } from './partner.entity';

export interface AssignmentView {
  id: string;
  orderId: string;
  partnerId: string;
  status: string;
}

@Injectable()
export class DispatchService {
  constructor(
    @InjectRepository(Partner) private readonly partners: Repository<Partner>,
    @InjectRepository(Assignment)
    private readonly assignments: Repository<Assignment>,
    private readonly dataSource: DataSource,
  ) {}

  createPartner(name: string, phone: string): Promise<Partner> {
    return this.partners.save(this.partners.create({ name, phone }));
  }

  async verifyPartner(id: string): Promise<Partner> {
    const result = await this.partners.update({ id }, { isVerified: true });
    if (!result.affected) {
      throw new NotFoundException('Partner not found');
    }
    return this.partners.findOneByOrFail({ id });
  }

  async setOnline(id: string, isOnline: boolean): Promise<Partner> {
    const result = await this.partners.update({ id }, { isOnline });
    if (!result.affected) {
      throw new NotFoundException('Partner not found');
    }
    return this.partners.findOneByOrFail({ id });
  }

  // Order को अगले उपलब्ध Partner को सौंपो
  async assign(orderId: string): Promise<AssignmentView> {
    const order = await this.dataSource
      .getRepository(Order)
      .findOne({ where: { id: orderId }, select: { id: true, status: true } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    // दुकान ने स्वीकार किया हो, और अभी डिलीवरी पर न निकला हो
    if (order.status !== 'ACCEPTED' && order.status !== 'PACKED') {
      throw new ConflictException(
        `Order is ${order.status}; it must be ACCEPTED or PACKED to assign`,
      );
    }

    // जिसने पहले मना किया वह दोबारा नहीं, और जिसके पास पहले से सक्रिय Order है वह भी नहीं
    const candidates = await this.partners
      .createQueryBuilder('p')
      .where('p."isOnline" = true AND p."isVerified" = true')
      .andWhere(
        `p.id NOT IN (SELECT a."partnerId" FROM assignments a WHERE a."status" IN ('OFFERED','ACCEPTED'))`,
      )
      .andWhere(
        `p.id NOT IN (SELECT a."partnerId" FROM assignments a WHERE a."orderId" = :orderId AND a."status" = 'REJECTED')`,
        { orderId },
      )
      .orderBy('p."createdAt"', 'ASC')
      .getMany();

    for (const partner of candidates) {
      try {
        const saved = await this.assignments.save(
          this.assignments.create({
            orderId,
            partnerId: partner.id,
            status: 'OFFERED',
          }),
        );
        return this.toView(saved);
      } catch (error) {
        // 23505: Database ने दोहराव रोका (किसी और ने पहले इस Partner या Order को ले लिया)
        if ((error as { code?: string }).code !== '23505') {
          throw error;
        }
        const taken = await this.assignments.findOne({
          where: [
            { orderId, status: 'OFFERED' },
            { orderId, status: 'ACCEPTED' },
          ],
        });
        if (taken) {
          throw new ConflictException('Order is already assigned');
        }
        // वरना यह Partner किसी और Order में लग गया: अगला Partner आज़माओ
      }
    }
    throw new ConflictException('No available delivery partner right now');
  }

  accept(assignmentId: string): Promise<AssignmentView> {
    return this.respond(assignmentId, 'ACCEPTED');
  }

  reject(assignmentId: string): Promise<AssignmentView> {
    return this.respond(assignmentId, 'REJECTED');
  }

  // Partner का काम पूरा होने पर (डिलीवर या रद्द) उसे अगले Order के लिए मुक्त करो।
  // सक्रिय सौंपना "ACCEPTED" से "REJECTED" नहीं, बल्कि पूरा हुआ मानकर बंद करें।
  async release(orderId: string): Promise<void> {
    await this.assignments.update(
      { orderId, status: 'ACCEPTED' },
      { status: 'REJECTED' },
    );
  }

  private async respond(
    assignmentId: string,
    to: 'ACCEPTED' | 'REJECTED',
  ): Promise<AssignmentView> {
    // तभी बदलो जब अभी भी OFFERED हो: दोहराव या होड़ में एक ही माँग सफल
    const result = await this.assignments.update(
      { id: assignmentId, status: 'OFFERED' },
      { status: to },
    );
    if (!result.affected) {
      const existing = await this.assignments.findOneBy({ id: assignmentId });
      if (!existing) {
        throw new NotFoundException('Assignment not found');
      }
      throw new ConflictException(`Assignment is already ${existing.status}`);
    }
    return this.toView(await this.assignments.findOneByOrFail({ id: assignmentId }));
  }

  private toView(a: Assignment): AssignmentView {
    return {
      id: a.id,
      orderId: a.orderId,
      partnerId: a.partnerId,
      status: a.status,
    };
  }
}
