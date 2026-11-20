import { BadRequestException } from '@nestjs/common';

export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };

const text = (value: unknown, max: number) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);

/** Checks what a browser's `PushSubscription.toJSON()` sent. Only https push-service addresses are accepted (plus loopback http in local development). */
export function parseSubscription(input: unknown, allowLoopback = false): SubscriptionInput {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const keys = body.keys && typeof body.keys === 'object' ? (body.keys as Record<string, unknown>) : {};
  const endpoint = text(body.endpoint, 1000), p256dh = text(keys.p256dh, 200), auth = text(keys.auth, 100);
  if (!endpoint || !p256dh || !auth) throw new BadRequestException('A push subscription needs an endpoint and keys.');
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new BadRequestException('The push endpoint is not a valid address.'); }
  const loopback = allowLoopback && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !loopback) || url.username || url.password) throw new BadRequestException('The push endpoint must be an https address.');
  if (Buffer.from(p256dh, 'base64url').length !== 65 || Buffer.from(auth, 'base64url').length !== 16) throw new BadRequestException('The push keys are not valid.');
  return { endpoint: url.toString(), p256dh, auth };
}

export function parseEndpoint(input: unknown): string {
  const endpoint = input && typeof input === 'object' ? text((input as Record<string, unknown>).endpoint, 1000) : null;
  if (!endpoint) throw new BadRequestException('Say which subscription to remove.');
  return endpoint;
}

/** One notification reads as itself; several collapse into a count, so a burst never floods a phone. */
export function pushMessage(items: { actorName: string; message: string; workspaceName: string; href: string }[], webBaseUrl: string): { title: string; body: string; url: string } {
  if (items.length === 1) return { title: items[0].workspaceName, body: `${items[0].actorName} ${items[0].message}`.slice(0, 180), url: `${webBaseUrl}${items[0].href}` };
  return { title: 'AVEN.', body: `You have ${items.length} new notifications.`, url: `${webBaseUrl}/workspace/inbox` };
}
