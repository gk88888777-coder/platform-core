import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from '../catalog/store.entity';
import { EventsModule } from '../events/events.module';
import { IdentityModule } from '../identity/identity.module';
import { Notification } from './notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsSubscriber } from './notifications.subscriber';

// ऐप के भीतर की सूचनाएँ। ईमेल और पुश बाद में इसी घटना-व्यवस्था पर जुड़ेंगे।
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Store]),
    EventsModule,
    IdentityModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsSubscriber],
  exports: [NotificationsService],
})
export class NotificationsModule {}
