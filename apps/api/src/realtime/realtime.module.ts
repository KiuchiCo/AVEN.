import { Global, Module } from '@nestjs/common';
import { readApiEnvironment } from '../config/api-environment.js';
import { RealtimeBus } from './realtime-bus.js';

/** One bus per API instance, shared by everything that pushes live events. */
@Global()
@Module({
  providers: [{ provide: RealtimeBus, useFactory: () => { const environment = readApiEnvironment(); return new RealtimeBus(environment.realtimeBus === 'postgres' ? environment.databaseUrl.replace(/\?.*$/, '') : undefined); } }],
  exports: [RealtimeBus],
})
export class RealtimeModule {}
