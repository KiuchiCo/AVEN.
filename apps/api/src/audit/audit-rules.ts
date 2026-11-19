import { BadRequestException } from '@nestjs/common';

export const auditLimits = { page: 50, export: 10_000 } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditQuery = { entityType?: string; actorId?: string; from?: Date; to?: Date; q?: string; cursor?: { createdAt: Date; id: string } };

const date = (value: unknown, label: string, endOfDay = false): Date | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(value) || Number.isNaN(Date.parse(value))) throw new BadRequestException(`${label} must be a date such as 2026-03-31.`);
  const parsed = new Date(value);
  return endOfDay && value.length === 10 ? new Date(parsed.getTime() + 86_400_000 - 1) : parsed;
};

/** Filters for the audit log. Everything is checked, so a made-up value is refused rather than quietly ignored. */
export function parseAuditQuery(raw: Record<string, unknown>): AuditQuery {
  const query: AuditQuery = {};
  if (raw.entityType !== undefined && raw.entityType !== '') {
    if (typeof raw.entityType !== 'string' || !/^[A-Z_]{1,32}$/.test(raw.entityType)) throw new BadRequestException('entityType is not valid.');
    query.entityType = raw.entityType;
  }
  if (raw.actorId !== undefined && raw.actorId !== '') {
    if (typeof raw.actorId !== 'string' || !uuid.test(raw.actorId)) throw new BadRequestException('actorId is not valid.');
    query.actorId = raw.actorId;
  }
  query.from = date(raw.from, 'from'); query.to = date(raw.to, 'to', true);
  if (query.from && query.to && query.from > query.to) throw new BadRequestException('The start date must be before the end date.');
  if (raw.q !== undefined && raw.q !== '') {
    if (typeof raw.q !== 'string' || raw.q.trim().length < 2 || raw.q.length > 80) throw new BadRequestException('Search for between 2 and 80 characters.');
    query.q = raw.q.trim();
  }
  if (raw.cursor !== undefined && raw.cursor !== '') {
    const [at, id] = typeof raw.cursor === 'string' ? raw.cursor.split('_') : [];
    if (!at || !id || Number.isNaN(Date.parse(at)) || !uuid.test(id)) throw new BadRequestException('cursor is not valid.');
    query.cursor = { createdAt: new Date(at), id };
  }
  return query;
}

export const cursorFor = (row: { createdAt: Date; id: string }) => `${row.createdAt.toISOString()}_${row.id}`;

/** A spreadsheet cell that can't run as a formula when the file is opened. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function auditCsv(rows: { createdAt: Date; actor: { displayName: string; email: string }; entityType: string; entityId: string; message: string }[]): string {
  const lines = [['When (UTC)', 'Person', 'Email', 'Area', 'Item id', 'What happened'].join(',')];
  for (const row of rows) lines.push([row.createdAt.toISOString(), row.actor.displayName, row.actor.email, row.entityType, row.entityId, row.message].map((cell) => csvCell(String(cell))).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
