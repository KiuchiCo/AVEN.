import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { RateLimitGuard } from '../common/rate-limit.guard.js';
import { readApiEnvironment } from '../config/api-environment.js';
import { reporter } from './error-reporter.js';
import { metrics } from './metrics.js';
import { scrub, scrubPath } from './scrub.js';

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

@Controller()
export class ObservabilityController {
  private readonly token = readApiEnvironment().monitoring.metricsToken;

  /** Prometheus metrics. Needs `Authorization: Bearer <METRICS_TOKEN>`; with no token configured nobody can read it. */
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  read(@Headers('authorization') authorization?: string) {
    const given = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!this.token || !given || !same(given, this.token)) throw new UnauthorizedException('A valid metrics token is required.');
    return metrics.render();
  }

  /**
   * Errors from the browser. Open to signed-out pages too, so it is tightly limited and keeps nothing but what the browser says went wrong, with addresses
   * reduced to a path pattern. It never stores or forwards the body of the report as given.
   */
  @Post('telemetry/client-error')
  @HttpCode(204)
  @UseGuards(RateLimitGuard.strict(20))
  clientError(@Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
    if (!input || typeof input.message !== 'string' || !input.message.trim()) throw new BadRequestException('A message is required.');
    const kind = input.kind === 'unhandledrejection' ? 'unhandledrejection' : 'error';
    const error = new Error(scrub(input.message, 500)); error.name = kind === 'error' ? 'BrowserError' : 'BrowserUnhandledRejection';
    error.stack = typeof input.stack === 'string' ? `${error.name}: ${error.message}\n${scrub(input.stack, 4000)}` : undefined;
    metrics.inc('client_errors_total', { kind });
    reporter.capture(error, { area: 'frontend', route: typeof input.path === 'string' ? scrubPath(input.path) : undefined, extra: typeof input.release === 'string' ? { release: input.release.slice(0, 40) } : undefined });
  }
}
