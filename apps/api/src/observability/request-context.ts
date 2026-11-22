import { AsyncLocalStorage } from 'node:async_hooks';

/** The request being served, so a log line written deep inside it can carry the same request id the client was given. */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
