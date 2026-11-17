import { verifyToken } from '@clerk/backend';
import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedIdentity } from './auth.types.js';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('A valid sign-in session is required.');
    }

    const jwtKey = process.env.CLERK_JWT_KEY?.replaceAll('\\n', '\n');
    const issuer = process.env.CLERK_ISSUER;
    const authorizedParties = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (!jwtKey || !issuer || authorizedParties.length === 0) {
      throw new ServiceUnavailableException('Clerk API verification is not configured.');
    }

    try {
      const claims = await verifyToken(token, {
        jwtKey,
        issuer,
        authorizedParties,
      });

      if (typeof claims.sub !== 'string' || typeof claims.iss !== 'string') {
        throw new UnauthorizedException('The sign-in token is missing identity claims.');
      }
      if (claims.sts && claims.sts !== 'active') {
        throw new UnauthorizedException('Complete the required sign-in steps before continuing.');
      }

      const identity: AuthenticatedIdentity = { issuer: claims.iss, subject: claims.sub };
      request.authenticatedIdentity = identity;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('The sign-in session is invalid or expired.');
    }
  }
}
