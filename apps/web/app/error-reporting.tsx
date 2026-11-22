'use client';

import { useEffect } from 'react';
import { createReporter } from './report-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** Listens for script errors and unhandled promise rejections and reports them to the API (which forwards them to the error tracker when one is configured). Draws nothing. */
export function ErrorReporting() {
  useEffect(() => {
    const report = createReporter(apiBase ? `${apiBase}/telemetry/client-error` : undefined, (url, body) => {
      if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) void fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
    }, process.env.NEXT_PUBLIC_APP_RELEASE);
    const onError = (event: ErrorEvent) => report(event.error ?? event.message, 'error', window.location.pathname);
    const onRejection = (event: PromiseRejectionEvent) => report(event.reason, 'unhandledrejection', window.location.pathname);
    window.addEventListener('error', onError); window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
