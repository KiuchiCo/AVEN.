import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Fixed-window limiter keyed by client IP.
 * shortcut: counters live in process memory, so limits are per API instance and reset on restart; move to Redis when running more than one instance.
 * Behind a proxy/load balancer, set Express `trust proxy` so request.ip is the real client.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  /**
   * `liveLimit`: live document typing sends a request about every round trip while someone types (and caret reports besides), so it gets its
   * own, larger allowance per address instead of using up the ordinary one.
   */
  constructor(private readonly limit = 600, private readonly windowMs = 60_000, private readonly now: () => number = Date.now, private readonly liveLimit = 3000) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (/\/health(\/ready)?$/.test(request.path)) return true;

    const now = this.now();
    const live = /\/documents\/[^/]+\/text\//.test(request.path);
    const key = `${request.ip ?? 'unknown'}${live ? ':live' : ''}`;
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, entry);
      if (this.windows.size > 10_000) for (const [k, v] of this.windows) if (v.resetAt <= now) this.windows.delete(k);
    }
    entry.count += 1;
    if (entry.count > (live ? this.liveLimit : this.limit)) {
      http.getResponse<Response>().setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      throw new HttpException('Too many requests. Please slow down and try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
