import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

export interface GoogleTokenVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

const CLIENT_ID_PATTERN = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

// GOOGLE_CLIENT_IDS: कॉमा से अलग किए Client ID। ग़लत दिखने वाले छोड़ दिए जाते हैं।
export function parseClientIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => CLIENT_ID_PATTERN.test(part));
}

@Injectable()
export class GoogleLibraryVerifier implements GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const audiences = parseClientIds(this.config.get<string>('GOOGLE_CLIENT_IDS'));
    // सेटिंग न हो तो Google Login बंद (fail closed)
    if (audiences.length === 0) {
      throw new ServiceUnavailableException('Google login is not configured');
    }
    try {
      // हस्ताक्षर, जारीकर्ता, समय-सीमा और "यह Token हमारे ही Client ID के लिए है" की जाँच
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (
        !payload ||
        !payload.sub ||
        !payload.email ||
        payload.email_verified !== true
      ) {
        throw new UnauthorizedException();
      }
      return {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name ?? null,
      };
    } catch {
      throw new UnauthorizedException();
    }
  }
}
