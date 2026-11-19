import { UnauthorizedException } from '@nestjs/common';
import { AuthedRequest } from './auth.types';

// Guard पास होने के बाद Login वाले उपयोगकर्ता की पहचान निकालो
export const currentUserId = (request: AuthedRequest): string => {
  if (!request.user) {
    throw new UnauthorizedException();
  }
  return request.user.userId;
};
