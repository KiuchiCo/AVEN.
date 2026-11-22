import type { LoggerService, LogLevel } from '@nestjs/common';
import { requestContext } from './request-context.js';
import { scrub } from './scrub.js';

const order: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
const names: Record<string, string> = { verbose: 'debug', debug: 'debug', log: 'info', warn: 'warn', error: 'error', fatal: 'fatal' };

/** One JSON object per line on stdout (stderr for errors): time, level, context, the request id when there is one, and a scrubbed message. */
export class JsonLogger implements LoggerService {
  constructor(private readonly minimum: LogLevel = 'log', private readonly write: (stream: 'out' | 'err', line: string) => void = (stream, line) => (stream === 'err' ? process.stderr : process.stdout).write(`${line}\n`)) {}

  private emit(level: LogLevel, message: unknown, params: unknown[]) {
    if (order.indexOf(level) < order.indexOf(this.minimum)) return;
    const context = typeof params[params.length - 1] === 'string' && level !== 'error' ? String(params[params.length - 1]) : undefined;
    const trace = level === 'error' && typeof params[0] === 'string' && params[0].includes('\n') ? params[0] : undefined;
    let text: string; let fields: Record<string, unknown> = {};
    if (typeof message === 'string') {
      text = message;
      try { const parsed = JSON.parse(message); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { fields = parsed as Record<string, unknown>; text = typeof fields.message === 'string' ? fields.message : fields.event ? String(fields.event) : fields.method ? `${fields.method} ${fields.path ?? ''}`.trim() : message; } } catch { /* plain text */ }
    } else if (message instanceof Error) { text = message.message; fields = { error: message.name }; } else text = JSON.stringify(message) ?? String(message);
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) safe[key] = typeof value === 'string' ? scrub(value, 500) : value;
    const line = JSON.stringify({ time: new Date().toISOString(), level: names[level], context, requestId: requestContext.getStore()?.requestId, ...safe, message: scrub(text, 2000), ...(trace ? { stack: scrub(trace, 4000) } : {}) });
    this.write(level === 'error' || level === 'fatal' ? 'err' : 'out', line);
  }

  log(message: unknown, ...params: unknown[]) { this.emit('log', message, params); }
  error(message: unknown, ...params: unknown[]) { this.emit('error', message, params); }
  warn(message: unknown, ...params: unknown[]) { this.emit('warn', message, params); }
  debug(message: unknown, ...params: unknown[]) { this.emit('debug', message, params); }
  verbose(message: unknown, ...params: unknown[]) { this.emit('verbose', message, params); }
  fatal(message: unknown, ...params: unknown[]) { this.emit('fatal', message, params); }
}
