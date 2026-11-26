import { activeLanguage, translate } from '../i18n/core';

/**
 * The error for a request that could not be signed. No token almost always means the sign-in expired (a reload signs
 * the person in again); a token with no API address means the app itself is not configured.
 */
export function connectionError(token: string | null | undefined): Error {
  return new Error(translate(activeLanguage(), token ? 'err.noApi' : 'err.signedOut'));
}

/** A request that never reached AVEN (no connection, server down). Still a TypeError, so existing offline checks keep working. */
export class NetworkError extends TypeError {
  constructor() { super(translate(activeLanguage(), 'err.network')); this.name = 'NetworkError'; }
}

/** `fetch` for AVEN's API: identical, except that a failed connection says so in the person's language instead of the browser's "Failed to fetch". */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, init).catch((reason: unknown) => {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason; // a cancelled request stays a cancellation
    throw new NetworkError();
  });
}
