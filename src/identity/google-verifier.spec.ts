import { parseClientIds } from './google-verifier';

describe('parseClientIds', () => {
  const A = '646982177645-abc123def456.apps.googleusercontent.com';
  const B = '111111111111-zzz999yyy888.apps.googleusercontent.com';

  it('returns nothing when the setting is missing or empty', () => {
    expect(parseClientIds(undefined)).toEqual([]);
    expect(parseClientIds('')).toEqual([]);
    expect(parseClientIds('   ')).toEqual([]);
  });

  it('accepts a valid client id', () => {
    expect(parseClientIds(A)).toEqual([A]);
  });

  it('accepts several ids and ignores spaces around the commas', () => {
    expect(parseClientIds(` ${A} , ${B} `)).toEqual([A, B]);
  });

  it('drops anything that does not look like a client id', () => {
    const raw = `${A},not-an-id,abc.apps.googleusercontent.com,${B}`;
    expect(parseClientIds(raw)).toEqual([A, B]);
  });
});
