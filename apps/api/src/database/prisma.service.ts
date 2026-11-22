import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { metrics } from '../observability/metrics.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const { databaseUrl } = readApiEnvironment();
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: [{ emit: 'event', level: 'query' }] });
    // Only how long each query took is kept: never its text or values, which can hold personal content.
    (this as unknown as { $on(event: 'query', listener: (event: { duration: number }) => void): void }).$on('query', (event) => metrics.observe('db_query_duration_seconds', event.duration / 1000));
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
