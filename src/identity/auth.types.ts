import type { Role } from './user.entity';

export interface AuthUser {
  userId: string;
  role: Role;
}

export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
}

export interface UserView {
  id: string;
  phone: string;
  role: Role;
}
