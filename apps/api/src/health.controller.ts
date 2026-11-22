import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';
import { metrics } from './observability/metrics.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. Never touches the database, so a database outage doesn't get the API restarted. */
  @Get()
  getHealth() {
    return { status: 'ok', service: 'aven-api' };
  }

  /** Readiness: the database answers. Point a load balancer here so traffic stops while it is down. */
  @Get('ready')
  async ready() {
    const started = process.hrtime.bigint();
    try { await this.prisma.$queryRaw`SELECT 1`; }
    catch { metrics.inc('db_connection_failures_total'); throw new ServiceUnavailableException('The database is not reachable.'); }
    metrics.set('db_ping_seconds', Number(process.hrtime.bigint() - started) / 1e9);
    return { status: 'ready', service: 'aven-api' };
  }
}
