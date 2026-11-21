import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';

export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// हर नया काम (सूचना, भुगतान, कमाई) ख़ुद को यहाँ दर्ज करवाता है। Subscriber दोहराव सह सके
// (idempotent) ऐसा होना चाहिए, क्योंकि घटना कम से कम एक बार पहुँचती है, कभी दोबारा भी।
export interface EventSubscriber {
  types: string[];
  handle(event: DomainEvent): Promise<void>;
}

const MAX_ATTEMPTS = 5;
const DEFAULT_POLL_MS = 2000;

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subscribers: EventSubscriber[] = [];
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const ms = this.pollMs();
    // टेस्ट में अपने-आप चलने वाला चक्र बंद: टेस्ट ख़ुद processPending बुलाते हैं
    if (process.env.NODE_ENV === 'test' || ms <= 0) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, ms);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  register(subscriber: EventSubscriber): () => void {
    this.subscribers.push(subscriber);
    return () => {
      const index = this.subscribers.indexOf(subscriber);
      if (index >= 0) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  // Order के बदलाव वाले उसी Transaction (manager) में बुलाएँ
  async record(
    manager: EntityManager,
    type: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const repo = manager.getRepository(OutboxEvent);
    await repo.save(repo.create({ type, aggregateId, payload }));
  }

  // लौटाता है कितनी घटनाएँ कतार से निकलीं (सफल, या 5 प्रयास के बाद हार मानी हुई)
  async processPending(limit = 50): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      // SKIP LOCKED: कई सर्वर चलें तो एक ही घटना दो बार नहीं उठती
      const events = await manager
        .createQueryBuilder(OutboxEvent, 'e')
        .where('e."processedAt" IS NULL')
        .orderBy('e."createdAt"', 'ASC')
        .limit(limit)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      let finished = 0;
      for (const event of events) {
        const matching = this.subscribers.filter((s) =>
          s.types.includes(event.type),
        );
        try {
          for (const subscriber of matching) {
            await subscriber.handle({
              id: event.id,
              type: event.type,
              aggregateId: event.aggregateId,
              payload: event.payload,
              createdAt: event.createdAt,
            });
          }
          await manager.update(
            OutboxEvent,
            { id: event.id },
            { processedAt: new Date() },
          );
          finished += 1;
        } catch (error) {
          const attempts = event.attempts + 1;
          const giveUp = attempts >= MAX_ATTEMPTS;
          const message = String((error as Error).message ?? error).slice(
            0,
            500,
          );
          await manager.update(
            OutboxEvent,
            { id: event.id },
            giveUp
              ? {
                  attempts,
                  lastError: message,
                  failed: true,
                  processedAt: new Date(),
                }
              : { attempts, lastError: message },
          );
          if (giveUp) {
            finished += 1;
          }
          this.logger.warn(
            `Event ${event.type} failed (attempt ${attempts}): ${message}`,
          );
        }
      }
      return finished;
    });
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.processPending(50);
    } catch (error) {
      this.logger.error(`Event processing failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private pollMs(): number {
    const raw = this.config.get<string>('EVENTS_POLL_MS');
    if (raw === undefined || raw.trim() === '') {
      return DEFAULT_POLL_MS;
    }
    const value = Number(raw);
    return Number.isInteger(value) && value >= 0 && value <= 600000
      ? value
      : DEFAULT_POLL_MS;
  }
}
