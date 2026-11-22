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

    this.logger.error(JSON.stringify({ requestId, method: request.method, path: redactPath(request.path) }), exception instanceof Error ? exception.stack : String(exception));
    reporter.capture(exception, { area: 'http', requestId: String(requestId ?? ''), method: request.method, route: `${request.baseUrl ?? ''}${request.route?.path ?? ''}`, status: 500 });
    response.status(500).json({ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong. Please try again.', requestId });
  }
}
