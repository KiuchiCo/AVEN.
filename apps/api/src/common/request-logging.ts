import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

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
    logger.log(JSON.stringify({ requestId, method: request.method, path: redactPath(request.path), status: response.statusCode, ms: Math.round(ms) }));
  });
  next();
}
