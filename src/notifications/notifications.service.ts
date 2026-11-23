import { randomUUID } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from './notification.entity';

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  orderId: string | null;
  read: boolean;
  createdAt: Date;
}

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  orderId?: string | null;
  eventId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  // दोहराव सुरक्षित: उसी घटना और उसी व्यक्ति की दूसरी सूचना चुपचाप छोड़ दी जाती है
  async notify(input: NotifyInput): Promise<void> {
    await this.repo.query(
      `INSERT INTO notifications ("id","userId","eventId","type","title","body","orderId")
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT ("eventId","userId") WHERE "eventId" IS NOT NULL DO NOTHING`,
      [
        randomUUID(),
        input.userId,
        input.eventId ?? null,
        input.type,
        input.title,
        input.body,
        input.orderId ?? null,
      ],
    );
  }

  async list(
    userId: string,
    unreadOnly: boolean,
    limit: number,
  ): Promise<NotificationView[]> {
    const rows = await this.repo.find({
      where: unreadOnly ? { userId, readAt: IsNull() } : { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      orderId: n.orderId,
      read: n.readAt !== null,
      createdAt: n.createdAt,
    }));
  }

  unreadCount(userId: string): Promise<number> {
    return this.repo.countBy({ userId, readAt: IsNull() });
  }

  // दूसरे की सूचना हो तो 404, ताकि उसके होने का भी पता न चले
  async markRead(userId: string, id: string): Promise<void> {
    const own = await this.repo.findOneBy({ id, userId });
    if (!own) {
      throw new NotFoundException('Notification not found');
    }
    if (!own.readAt) {
      await this.repo.update({ id, userId, readAt: IsNull() }, { readAt: new Date() });
    }
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.repo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return result.affected ?? 0;
  }
}
