import type { NextFunction, Request, Response } from 'express';

/**
 * Headers for an API that only ever returns JSON or event streams, so browsers never treat a response as a page.
 * HSTS is sent only in production, where the API sits behind HTTPS; on local HTTP it would only confuse a browser.
 */
export function securityHeaders(production: boolean) {
  return (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (production) response.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}
