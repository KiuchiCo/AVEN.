import { reportIntegrationFailure } from '../observability/error-reporter.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Email } from './mailer.js';
import { emailSenderKind, readApiEnvironment } from '../config/api-environment.js';
import { MAILER, type OptionalMailer } from './mailer.js';

export type EmailOutcome = 'sent' | 'failed' | 'not_configured';

/** One-off emails (such as invitations). Never throws: the caller carries on whether or not the email goes out. */
@Injectable()
export class TransactionalEmail {
  private readonly logger = new Logger('Email');

  constructor(@Inject(MAILER) private readonly mailer: OptionalMailer) {}

  /** Sending is only offered when there is a key and a sender Resend can use. A free-mailbox or malformed EMAIL_FROM would be refused on every message, so it counts as not set up. */
  get available() { return this.mailer !== null && !['invalid', 'free_mail', 'missing'].includes(emailSenderKind(readApiEnvironment().emailFrom)); }

  async send(email: Email): Promise<EmailOutcome> {
    if (!this.available) return 'not_configured';
    try { await this.mailer!.send(email); return 'sent'; }
    catch (error) { reportIntegrationFailure('email', error); this.logger.warn(`Could not send an email: ${error instanceof Error ? error.message : 'unknown error'}`); return 'failed'; }
  }
}
