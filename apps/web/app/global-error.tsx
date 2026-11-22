'use client';

import { useEffect } from 'react';
import { createReporter } from './report-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

/** The last-resort screen when the whole page fails to render. It reports what happened, then lets the person try again. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    createReporter(apiBase ? `${apiBase}/telemetry/client-error` : undefined, (url, body) => { void fetch(url, { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined); }, process.env.NEXT_PUBLIC_APP_RELEASE)(error, 'error', window.location.pathname);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F8F6F1', color: '#2B2A27', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <main role="alert" style={{ maxWidth: 440, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Playfair Display, Georgia, serif', fontWeight: 500, fontSize: 28, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#6B5746', lineHeight: 1.6, margin: '0 0 20px' }}>AVEN. could not show this page. The problem has been reported. Your work is saved.</p>
          <button type="button" onClick={reset} style={{ background: '#2B2A27', color: '#F8F6F1', border: 0, borderRadius: 999, padding: '12px 24px', minHeight: 44, font: 'inherit', cursor: 'pointer' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
