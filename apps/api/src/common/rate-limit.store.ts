import type { PrismaService } from '../database/prisma.service.js';

export type Hit = { count: number; resetAt: number };
/** Counts requests per key in fixed windows. */
export interface RateLimitStore { hit(key: string, windowMs: number, now: number): Promise<Hit> }

/**
 * Shares the counters between every API instance, and keeps them across restarts, through one atomic upsert per request.
 * shortcut: one database round trip per limited request; move to Redis if the limited routes become hot.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  private sweeps = 0;
  constructor(private readonly prisma: Pick<PrismaService, '$queryRaw' | '$executeRaw'>) {}

  async hit(key: string, windowMs: number, now: number): Promise<Hit> {
    const at = new Date(now); const next = new Date(now + windowMs);
    const rows = await this.prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO rate_limit_buckets ("key", "count", "resetAt") VALUES (${key.slice(0, 300)}, 1, ${next})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN rate_limit_buckets."resetAt" <= ${at} THEN 1 ELSE rate_limit_buckets."count" + 1 END,
        "resetAt" = CASE WHEN rate_limit_buckets."resetAt" <= ${at} THEN ${next} ELSE rate_limit_buckets."resetAt" END
      RETURNING "count", "resetAt"`;
    if (++this.sweeps % 500 === 0) void this.prisma.$executeRaw`DELETE FROM rate_limit_buckets WHERE "resetAt" < ${new Date(now - 3_600_000)}`.catch(() => undefined);
    return { count: Number(rows[0].count), resetAt: rows[0].resetAt.getTime() };
  }
}
