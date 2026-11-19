import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from '../identity/user.entity';
import { Order } from '../orders/order.entity';
import { Assignment } from './assignment.entity';
import { Partner } from './partner.entity';

export interface AssignmentView {
  id: string;
  orderId: string;
  partnerId: string;
  status: string;
}

// सूची में फ़ोन नंबर जानबूझकर नहीं
export interface PartnerView {
  id: string;
  name: string;
  isOnline: boolean;
  isVerified: boolean;
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

  // Admin: Partner प्रोफ़ाइल को Login वाले अकाउंट से जोड़ो (अकाउंट का Role पहले PARTNER हो)
  async linkUser(partnerId: string, userId: string): Promise<PartnerView> {
    const user = await this.dataSource
      .getRepository(User)
      .findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== 'PARTNER') {
      throw new ConflictException('User must have the PARTNER role first');
    }
    try {
      const result = await this.partners.update({ id: partnerId }, { userId });
      if (!result.affected) {
        throw new NotFoundException('Partner not found');
      }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'This user is already linked to another partner',
        );
      }
      throw error;
    }
    return this.toPartnerView(
      await this.partners.findOneByOrFail({ id: partnerId }),
    );
  }

  // Partner ख़ुद: ऑनलाइन/ऑफ़लाइन (असत्यापित Partner ऑनलाइन नहीं हो सकता)
  async setOnlineForUser(
    userId: string,
    isOnline: boolean,
  ): Promise<PartnerView> {
    const partner = await this.partnerOfUser(userId);
    if (isOnline && !partner.isVerified) {
      throw new ForbiddenException('Partner is not verified yet');
    }
    await this.partners.update({ id: partner.id }, { isOnline });
    return this.toPartnerView(
      await this.partners.findOneByOrFail({ id: partner.id }),
    );
  }

  // Partner ख़ुद: अपने चालू ऑफ़र और स्वीकार किए काम
  async offersForUser(userId: string): Promise<AssignmentView[]> {
    const partner = await this.partnerOfUser(userId);
    const rows = await this.assignments.find({
      where: { partnerId: partner.id, status: In(['OFFERED', 'ACCEPTED']) },
      order: { createdAt: 'DESC' },
    });
    return rows.map((a) => this.toView(a));
  }

  // Partner ख़ुद: अपने ही ऑफ़र का जवाब। दूसरे के ऑफ़र पर 404।
  async respondAsPartner(
    userId: string,
    assignmentId: string,
    to: 'ACCEPTED' | 'REJECTED',
  ): Promise<AssignmentView> {
    const partner = await this.partnerOfUser(userId);
    const result = await this.assignments.update(
      { id: assignmentId, partnerId: partner.id, status: 'OFFERED' },
      { status: to },
    );
    if (!result.affected) {
      const own = await this.assignments.findOneBy({
        id: assignmentId,
        partnerId: partner.id,
      });
      if (!own) {
        throw new NotFoundException('Offer not found');
      }
      throw new ConflictException(`Offer is already ${own.status}`);
    }
    return this.toView(
      await this.assignments.findOneByOrFail({ id: assignmentId }),
    );
  }

  // क्या इस Order के लिए किसी Partner ने स्वीकार किया है?
  async hasAcceptedAssignment(
    orderId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager
      ? manager.getRepository(Assignment)
      : this.assignments;
    return (await repo.count({ where: { orderId, status: 'ACCEPTED' } })) > 0;
  }

  async listPartners(): Promise<PartnerView[]> {
    const rows = await this.partners.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((p) => this.toPartnerView(p));
  }

  // ऑनलाइन, सत्यापित और जिसके पास कोई सक्रिय Order नहीं
  async listAvailable(): Promise<PartnerView[]> {
    const rows = await this.partners
      .createQueryBuilder('p')
      .where('p."isOnline" = true AND p."isVerified" = true')
      .andWhere(
        `p.id NOT IN (SELECT a."partnerId" FROM assignments a WHERE a."status" IN ('OFFERED','ACCEPTED'))`,
      )
      .orderBy('p."createdAt"', 'ASC')
      .getMany();
    return rows.map((p) => this.toPartnerView(p));
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

  // Order पूरा या रद्द होने पर उसका सक्रिय सौंपना बंद करो, ताकि Partner मुक्त हो।
  async closeForOrder(
    orderId: string,
    to: 'COMPLETED' | 'CANCELLED',
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(Assignment)
      : this.assignments;
    await repo.update(
      { orderId, status: In(['OFFERED', 'ACCEPTED']) },
      { status: to },
    );
  }

  private async partnerOfUser(userId: string): Promise<Partner> {
    const partner = await this.partners.findOneBy({ userId });
    if (!partner) {
      throw new ForbiddenException(
        'No delivery partner profile is linked to this account',
      );
    }
    return partner;
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
    return this.toView(
      await this.assignments.findOneByOrFail({ id: assignmentId }),
    );
  }

  private toView(a: Assignment): AssignmentView {
    return {
      id: a.id,
      orderId: a.orderId,
      partnerId: a.partnerId,
      status: a.status,
    };
  }

  private toPartnerView(p: Partner): PartnerView {
    return {
      id: p.id,
      name: p.name,
      isOnline: p.isOnline,
      isVerified: p.isVerified,
    };
  }
}
