import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

// AB-1007 task 6.1: search rate-limit configuration (FRS-SEARCH-001, design: 30 per 60 s).
const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  OTP_SECRET: 'test-only-otp-secret-0123456789-abcdefg',
};

describe('search rate-limit env', () => {
  it('defaults to 30 requests per 60 seconds', () => {
    expect(parseEnv(base)).toMatchObject({
      ok: true,
      env: { SEARCH_RATE_LIMIT_MAX: 30, SEARCH_RATE_LIMIT_WINDOW_SECONDS: 60 },
    });
  });

  it('coerces explicit values', () => {
    expect(
      parseEnv({ ...base, SEARCH_RATE_LIMIT_MAX: '5', SEARCH_RATE_LIMIT_WINDOW_SECONDS: '10' }),
    ).toMatchObject({
      ok: true,
      env: { SEARCH_RATE_LIMIT_MAX: 5, SEARCH_RATE_LIMIT_WINDOW_SECONDS: 10 },
    });
  });

  it.each(['abc', '0', '-5', '1.5'])('rejects SEARCH_RATE_LIMIT_MAX=%s', (v) => {
    expect(parseEnv({ ...base, SEARCH_RATE_LIMIT_MAX: v })).toEqual({
      ok: false,
      issues: [{ name: 'SEARCH_RATE_LIMIT_MAX', reason: 'invalid' }],
    });
  });

  it.each(['abc', '0', '-5'])('rejects SEARCH_RATE_LIMIT_WINDOW_SECONDS=%s', (v) => {
    expect(parseEnv({ ...base, SEARCH_RATE_LIMIT_WINDOW_SECONDS: v })).toEqual({
      ok: false,
      issues: [{ name: 'SEARCH_RATE_LIMIT_WINDOW_SECONDS', reason: 'invalid' }],
    });
  });
});
