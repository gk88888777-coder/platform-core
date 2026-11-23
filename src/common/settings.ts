import { ConfigService } from '@nestjs/config';

// सेटिंग से पूर्णांक पढ़ना: ग़लत, ख़ाली या सीमा से बाहर हो तो डिफ़ॉल्ट
export function intSetting(
  config: ConfigService,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return optionalIntSetting(config, name, min, max) ?? fallback;
}

// सेटिंग न हो या ग़लत हो तो undefined
export function optionalIntSetting(
  config: ConfigService,
  name: string,
  min: number,
  max: number,
): number | undefined {
  const raw = config.get<string>(name);
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}
