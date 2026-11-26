import { reportIntegrationFailure } from '../observability/error-reporter.js';
/** `idempotencyKey` makes Resend treat a repeated request (a retry after a lost reply) as the same email, so no one is emailed twice. */
export type Email = { to: string; subject: string; text: string; html: string; idempotencyKey?: string };

/** Sends one email. To use another service, write another class with this shape. */
export interface Mailer {
  readonly name: string;
  send(email: Email): Promise<void>;
}

/** `retry` says whether trying again could work (a busy service) or not (a rejected key or address). */
export class MailError extends Error {
  constructor(message: string, readonly retry: boolean) { super(message); }
}

type Settings = { apiKey: string; from: string; baseUrl: string };

/** Resend's HTTP API (POST /emails). Plain fetch, no SDK. */
export class ResendMailer implements Mailer {
  readonly name = 'resend';

  constructor(private readonly settings: Settings) {}

  async send(email: Email): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.settings.baseUrl.replace(/\/$/, '')}/emails`, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${this.settings.apiKey}`, 'content-type': 'application/json', ...(email.idempotencyKey ? { 'idempotency-key': email.idempotencyKey.slice(0, 256) } : {}) },
        body: JSON.stringify({ from: this.settings.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      });
    } catch (error) { reportIntegrationFailure('email', error, { kind: 'network' }); throw new MailError('The email service could not be reached.', true); }
    if (response.ok) return;
    reportIntegrationFailure('email', new Error(`The email service answered ${response.status}`), { status: response.status });
    const detail = await response.json().catch(() => null) as { message?: string } | null;
    // Resend names the problem in the body. Addresses are removed from what is kept, so a refusal never puts an email address in a log or a message.
    const reason = (detail?.message ?? '').replace(/[^\s<>@,;"']+@[^\s<>@,;"']+/g, '…').slice(0, 160);
    // The restricted testing sender only delivers to the Resend account's own address; Resend says so in the message.
    if (response.status === 403 && /testing emails|own email/i.test(reason)) throw new MailError('Resend’s testing sender (onboarding@resend.dev) can only deliver to your own Resend account address. Verify a domain at resend.com/domains to email other people.', false);
    if (response.status === 422 && /`?from`?/i.test(reason)) throw new MailError('EMAIL_FROM is not a valid sender. Use the form AVEN <name@your-verified-domain>.', false);
    if (response.status === 422 && /`?to`?|recipient|email address/i.test(reason)) throw new MailError('That email address was refused as invalid.', false);
    if (response.status === 403 && /domain|verif/i.test(reason)) throw new MailError('Resend will not send from this address because its domain is not verified. Verify the domain at resend.com/domains and use an address on it in EMAIL_FROM. While developing, AVEN <onboarding@resend.dev> works, but only delivers to your own Resend account address.', false);
    if (response.status === 401 || response.status === 403) throw new MailError(/api key/i.test(reason) || response.status === 401 ? 'The email service rejected the API key. Check EMAIL_API_KEY.' : `The email service refused this request${reason ? `: ${reason}` : '.'}`, false);
    if (response.status === 429 || response.status >= 500) throw new MailError('The email service is busy or unavailable.', true);
    throw new MailError(`The email service refused this message${reason ? `: ${reason}` : '.'}`, false);
  }
}

export const MAILER = Symbol('MAILER');
export type OptionalMailer = Mailer | null;
