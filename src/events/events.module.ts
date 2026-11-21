import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { OutboxEvent } from './outbox-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
