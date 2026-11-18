import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { readApiEnvironment } from './config/api-environment.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function bootstrap() {
  const environment = readApiEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '4mb' });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: environment.webOrigins,
    credentials: true,
  });

  await app.listen(environment.apiPort);
}

void bootstrap();
