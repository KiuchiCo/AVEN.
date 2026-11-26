import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { reporter } from '../observability/error-reporter.js';
import { redactPath } from './request-logging.js';

/** One error shape for every failure: { statusCode, message, error, requestId }. Unexpected errors never leak details. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = response.getHeader('x-request-id');

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      response.status(status).json({ statusCode: status, error: HttpStatus[status] ?? 'Error', ...payload, requestId });
      if (status >= 500) reporter.capture(exception, { area: 'http', requestId: String(requestId ?? ''), method: request.method, route: `${request.baseUrl ?? ''}${request.route?.path ?? ''}`, status });
      return;
    }

    // Database outcomes a person can act on, instead of a vague 500: two requests creating the same thing at once,
    // or a record that someone else deleted between reading and writing it. Nothing from the database message is sent.
    const code = prismaCode(exception);
    if (code === 'P2002' || code === 'P2025') {
      const status = code === 'P2002' ? 409 : 404;
      response.status(status).json({ statusCode: status, error: HttpStatus[status], message: code === 'P2002' ? 'That already exists. Refresh to see the latest version.' : 'That item no longer exists. It may have just been deleted.', requestId });
      return;
    }

    this.logger.error(JSON.stringify({ requestId, method: request.method, path: redactPath(request.path) }), exception instanceof Error ? exception.stack : String(exception));
    reporter.capture(exception, { area: 'http', requestId: String(requestId ?? ''), method: request.method, route: `${request.baseUrl ?? ''}${request.route?.path ?? ''}`, status: 500 });
    response.status(500).json({ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong. Please try again.', requestId });
  }
}

/** The code of a Prisma "known request" error (P2002 unique clash, P2025 record missing), without importing the generated client here. */
function prismaCode(exception: unknown): string | null {
  if (!exception || typeof exception !== 'object') return null;
  const { name, code } = exception as { name?: unknown; code?: unknown };
  return name === 'PrismaClientKnownRequestError' && typeof code === 'string' ? code : null;
}
