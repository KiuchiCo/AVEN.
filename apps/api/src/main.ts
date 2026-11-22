import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { PostgresRateLimitStore } from './common/rate-limit.store.js';
import { PrismaService } from './database/prisma.service.js';
import { securityHeaders } from './common/security-headers.js';
import { compress } from './common/compress.js';
import { requestLogging } from './common/request-logging.js';
import { reporter } from './observability/error-reporter.js';
import { JsonLogger } from './observability/json-logger.js';
import { readApiEnvironment } from './config/api-environment.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function bootstrap() {
  const environment = readApiEnvironment();
  reporter.configure({ dsn: environment.monitoring.errorTrackingDsn, environment: environment.monitoring.errorTrackingEnvironment, release: environment.monitoring.release });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, rawBody: true, ...(environment.isProduction ? { logger: new JsonLogger() } : {}) });
  app.disable('x-powered-by');
  app.set('trust proxy', environment.trustProxy);
  app.use(securityHeaders(environment.isProduction));
  app.use(compress);
  app.use(requestLogging);
  app.useBodyParser('json', { limit: '4mb' });
  app.useGlobalFilters(new AllExceptionsFilter());
  if (environment.rateLimitStore === 'postgres') RateLimitGuard.shared = new PostgresRateLimitStore(app.get(PrismaService));
  app.useGlobalGuards(new RateLimitGuard());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: environment.webOrigins,
    credentials: true,
    exposedHeaders: ['X-Row-Count', 'X-Truncated', 'Content-Disposition'],
  });

  app.enableShutdownHooks();
  await app.listen(environment.apiPort);
}

void bootstrap();
