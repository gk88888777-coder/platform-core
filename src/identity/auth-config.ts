import { ConfigService } from '@nestjs/config';

// Secret ग़ायब या छोटा हो तो सर्वर शुरू ही नहीं होगा।
export function requireSecret(config: ConfigService, name: string): string {
  const value = config.get<string>(name);
  if (!value || value.length < 32) {
    throw new Error(`${name} must be set and at least 32 characters long`);
  }
  return value;
}
