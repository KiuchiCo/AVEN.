import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { metrics } from '../observability/metrics.js';
import { requestContext } from '../observability/request-context.js';

const logger = new Logger('Request');

/** Addresses that carry a secret (a share link, an invitation) are logged without it, so the logs can never be used to open a shared document. */
export const redactPath = (path: string) => path.replace(/(\/shared\/documents\/)[^/]+/, '$1:token').replace(/(\/invitations\/)[^/]+/, '$1:token');

/** Assigns an x-request-id and writes one JSON log line per request. Query strings and bodies are never logged. */
export function requestLogging(request: Request, response: Response, next: NextFunction) {
  const incoming = request.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  response.setHeader('x-request-id', requestId);
  const started = process.hrtime.bigint();
  response.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const route = `${request.baseUrl ?? ''}${request.route?.path ?? ''}` || 'unmatched'; // the route pattern, never the real address: ids and tokens must not become metric labels
    metrics.inc('http_requests_total', { method: request.method, route, status: `${Math.floor(response.statusCode / 100)}xx` });
    metrics.observe('http_request_duration_seconds', ms / 1000, { method: request.method, route });
    logger.log(JSON.stringify({ requestId, method: request.method, path: redactPath(request.path), status: response.statusCode, ms: Math.round(ms) }));
  });
  requestContext.run({ requestId }, next);
}
