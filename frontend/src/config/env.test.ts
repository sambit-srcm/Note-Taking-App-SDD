import { describe, expect, it } from 'vitest';
import { getApiUrl } from './env';

const SENTINEL = 'SENTINEL_SECRET_VALUE';

function messageOf(env: Record<string, unknown>): string {
  try {
    getApiUrl(env);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  }
  throw new Error('expected getApiUrl to throw');
}

describe('getApiUrl', () => {
  it('returns a valid http URL', () => {
    expect(getApiUrl({ VITE_API_URL: 'http://localhost:3000' })).toBe('http://localhost:3000');
  });

  it('returns a valid https URL', () => {
    expect(getApiUrl({ VITE_API_URL: 'https://api.example.com' })).toBe('https://api.example.com');
  });

  it.each([
    ['missing', {}],
    ['empty string', { VITE_API_URL: '' }],
    ['not a URL', { VITE_API_URL: SENTINEL }],
    ['non-http(s) scheme', { VITE_API_URL: `ftp://${SENTINEL}.example.com` }],
  ])('throws naming VITE_API_URL when %s', (_label, env) => {
    expect(messageOf(env)).toContain('VITE_API_URL');
  });

  it.each([
    ['not a URL', SENTINEL],
    ['non-http(s) scheme', `ftp://${SENTINEL}.example.com`],
  ])('never echoes the supplied value (%s)', (_label, value) => {
    expect(messageOf({ VITE_API_URL: value })).not.toContain(SENTINEL);
  });
});
