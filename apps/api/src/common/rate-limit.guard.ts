import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import type { Request, Response } from 'express';
import type { Hit, RateLimitStore } from './rate-limit.store.js';

/** The client's address as Express worked it out from the trusted proxies. Anything that is not an IP address (a forged or malformed header value) is ignored in favour of the connection's own address, so garbage cannot be used to get a fresh allowance. */
function clientAddress(request: Request): string {
  if (request.ip && isIP(request.ip)) return request.ip;
  const direct = request.socket?.remoteAddress;
  return direct && isIP(direct) ? direct : 'unknown';
}

/**
 * Fixed-window limiter. The key is the signed-in account when the request already has one (guards listed after ClerkAuthGuard see it),
 * otherwise the client IP, so people behind one office or proxy address do not use up each other's allowance.
 * Counters live in process memory unless a shared store is set at startup (RATE_LIMIT_STORE=postgres): then every API instance counts together
 * and a restart does not reset them. If the shared store fails or is slow, ordinary routes count on this instance alone (a degraded but safe mode), while routes made with
 * `RateLimitGuard.strict` (AI, exports, invitations, calendar connections, automations) refuse with 503 instead: a weaker limit on the costly or abusable operations is not acceptable.
 * Behind a proxy/load balancer, set TRUST_PROXY to the number of proxies in front, so request.ip is the real client and cannot be forged.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  /** Set once at startup, before the first request. */
  static shared: RateLimitStore | null = null;
  /** How long the shared store may take before it counts as failed. */
  static storeTimeoutMs = 1500;
  private readonly local = new Map<string, { count: number; resetAt: number }>();

  /**
   * `liveLimit`: live document typing sends a request about every round trip while someone types (and caret reports besides), so it gets its
   * own, larger allowance per address instead of using up the ordinary one.
   */
  constructor(private readonly limit = 600, private readonly windowMs = 60_000, private readonly now: () => number = Date.now, private readonly liveLimit = 3000, private readonly failClosed = false) {}

  /** A limiter for sensitive routes: if the shared counters cannot be reached, requests are refused (503) rather than counted loosely. */
  static strict(limit: number, windowMs = 60_000) { return new RateLimitGuard(limit, windowMs, Date.now, 3000, true); }

  private hitLocal(key: string, now: number): Hit {
    let entry = this.local.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.local.set(key, entry);
      if (this.local.size > 10_000) for (const [k, v] of this.local) if (v.resetAt <= now) this.local.delete(k);
    }
    entry.count += 1;
    return entry;
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (/\/health(\/ready)?$/.test(request.path)) return true;

    const now = this.now();
    const live = /\/documents\/[^/]+\/text\//.test(request.path);
    const who = request.authenticatedIdentity;
    const key = `${who ? `u:${who.issuer}|${who.subject}` : `ip:${clientAddress(request)}`}${live ? ':live' : ''}:${this.limit}`;
    const check = (hit: Hit) => {
      if (hit.count > (live ? this.liveLimit : this.limit)) {
        http.getResponse<Response>().setHeader('Retry-After', Math.ceil((hit.resetAt - now) / 1000));
        throw new HttpException('Too many requests. Please slow down and try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
      }
      return true;
    };
    const store = RateLimitGuard.shared;
    if (!store) return check(this.hitLocal(key, now));
    return this.hitShared(store, key, now).then(check);
  }

  private async hitShared(store: RateLimitStore, key: string, now: number): Promise<Hit> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([store.hit(key, this.windowMs, now), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('rate limit store timed out')), RateLimitGuard.storeTimeoutMs); })]);
    } catch {
      if (this.failClosed) throw new HttpException('This service is briefly unavailable. Please try again in a moment.', HttpStatus.SERVICE_UNAVAILABLE);
      return this.hitLocal(key, now);
    } finally { clearTimeout(timer); }
  }
}
