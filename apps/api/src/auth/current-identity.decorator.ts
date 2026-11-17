import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedIdentity } from './auth.types.js';

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.authenticatedIdentity) {
      throw new UnauthorizedException();
    }
    return request.authenticatedIdentity;
  },
);
