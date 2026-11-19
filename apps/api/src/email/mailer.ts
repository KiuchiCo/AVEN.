export type Email = { to: string; subject: string; text: string; html: string };

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
        headers: { authorization: `Bearer ${this.settings.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: this.settings.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      });
    } catch { throw new MailError('The email service could not be reached.', true); }
    if (response.ok) return;
    if (response.status === 401 || response.status === 403) throw new MailError('The email service rejected the API key. Check EMAIL_API_KEY.', false);
    if (response.status === 429 || response.status >= 500) throw new MailError('The email service is busy or unavailable.', true);
    const detail = await response.json().catch(() => null) as { message?: string } | null;
    throw new MailError(`The email service refused this message${detail?.message ? `: ${detail.message.slice(0, 160)}` : '.'}`, false);
  }
}

export const MAILER = Symbol('MAILER');
export type OptionalMailer = Mailer | null;
