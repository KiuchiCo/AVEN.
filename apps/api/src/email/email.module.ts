import { Module } from '@nestjs/common';
import { readApiEnvironment } from '../config/api-environment.js';
import { NotificationEmailer } from './notification-emailer.service.js';
import { MAILER, ResendMailer } from './mailer.js';
import { TransactionalEmail } from './transactional-email.service.js';

@Module({
  providers: [
    // To use another email service, return a different Mailer here.
    { provide: MAILER, useFactory: () => { const { emailApiKey, emailFrom, emailBaseUrl } = readApiEnvironment(); return emailApiKey && emailFrom ? new ResendMailer({ apiKey: emailApiKey, from: emailFrom, baseUrl: emailBaseUrl }) : null; } },
    TransactionalEmail,
    NotificationEmailer,
  ],
  exports: [MAILER, TransactionalEmail],
})
export class EmailModule {}
