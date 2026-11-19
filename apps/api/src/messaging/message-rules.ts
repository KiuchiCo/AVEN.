import { BadRequestException } from '@nestjs/common';

export const messageLimits = { body: 4000, topic: 200, name: 40, channels: 50, page: 50 } as const;

/** "Design Team" becomes "design-team". Anything that can't be a clean name is refused rather than guessed at. */
export function parseChannelName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/^#/, '') : '';
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) throw new BadRequestException('Channel names use letters, numbers and hyphens, up to 40 characters.');
  return name;
}

export function parseTopic(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > messageLimits.topic) throw new BadRequestException(`A topic can be up to ${messageLimits.topic} characters.`);
  return value.trim();
}

export function parseMessageBody(value: unknown): string {
  const body = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
  if (!body) throw new BadRequestException('Write something to send.');
  if (body.length > messageLimits.body) throw new BadRequestException(`Messages can be up to ${messageLimits.body} characters.`);
  return body;
}

/** `before` is the createdAt of the oldest message the reader has, for loading earlier ones. */
export function parseBefore(value: unknown): Date | null {
  if (value === undefined || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new BadRequestException('before must be a date.');
  return date;
}
