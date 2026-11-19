import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { securityHeaders } from './common/security-headers.js';
import { requestLogging } from './common/request-logging.js';
import { readApiEnvironment } from './config/api-environment.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function bootstrap() {
  const environment = readApiEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, rawBody: true });
  app.disable('x-powered-by');
  app.set('trust proxy', environment.trustProxy);
  app.use(securityHeaders(environment.isProduction));
  app.use(requestLogging);
  app.useBodyParser('json', { limit: '4mb' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalGuards(new RateLimitGuard());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: environment.webOrigins,
    credentials: true,
  });

  app.enableShutdownHooks();
  await app.listen(environment.apiPort);
}

void bootstrap();
