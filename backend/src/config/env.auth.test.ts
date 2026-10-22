import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatEnvIssues, parseEnv } from './env.js';

// runtime-configuration delta (AB-1002): JWT signing secret and token lifetimes.
const SECRET = 'S3CRET-sentinel-0123456789-abcdefghijklmnop';
const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: SECRET,
  OTP_SECRET: 'test-only-otp-secret-0123456789-abcdefg',
};

describe('JWT_SECRET', () => {
  it('accepts a secret of 32 or more characters', () => {
    expect(parseEnv(base)).toMatchObject({ ok: true, env: { JWT_SECRET: SECRET } });
    expect(parseEnv({ ...base, JWT_SECRET: 'x'.repeat(32) }).ok).toBe(true);
  });

  it('reports a missing secret by name', () => {
    expect(parseEnv({ ...base, JWT_SECRET: undefined })).toEqual({
      ok: false,
      issues: [{ name: 'JWT_SECRET', reason: 'missing' }],
    });
  });

  it('treats an empty secret as missing', () => {
    expect(parseEnv({ ...base, JWT_SECRET: '' })).toEqual({
      ok: false,
      issues: [{ name: 'JWT_SECRET', reason: 'missing' }],
    });
  });

  it('rejects a secret shorter than 32 characters as invalid, without echoing it', () => {
    const short = 'SHORTSECRET-' + 'y'.repeat(19); // 31 chars
    expect(short.length).toBe(31);
    const result = parseEnv({ ...base, JWT_SECRET: short });
    expect(result).toEqual({ ok: false, issues: [{ name: 'JWT_SECRET', reason: 'invalid' }] });
    expect(JSON.stringify(result)).not.toContain('SHORTSECRET');
    expect(formatEnvIssues(result.ok ? [] : result.issues).join('\n')).toBe('JWT_SECRET: invalid');
  });

  it('never exposes a valid secret in issues raised by other variables', () => {
    const result = parseEnv({ ...base, PORT: 'abc' });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});

describe('token lifetimes', () => {
  it('defaults to 15 minutes access and 7 days refresh (FRS-AUTH-002)', () => {
    const result = parseEnv(base);
    expect(result).toMatchObject({
      ok: true,
      env: { ACCESS_TOKEN_TTL_SECONDS: 900, REFRESH_TOKEN_TTL_SECONDS: 604800 },
    });
  });

  it('coerces explicit values', () => {
    const result = parseEnv({
      ...base,
      ACCESS_TOKEN_TTL_SECONDS: '60',
      REFRESH_TOKEN_TTL_SECONDS: '120',
    });
    expect(result).toMatchObject({
      ok: true,
      env: { ACCESS_TOKEN_TTL_SECONDS: 60, REFRESH_TOKEN_TTL_SECONDS: 120 },
    });
  });

  it.each(['abc', '0', '-5', '1.5'])('rejects ACCESS_TOKEN_TTL_SECONDS=%s', (v) => {
    expect(parseEnv({ ...base, ACCESS_TOKEN_TTL_SECONDS: v })).toEqual({
      ok: false,
      issues: [{ name: 'ACCESS_TOKEN_TTL_SECONDS', reason: 'invalid' }],
    });
  });

  it.each(['abc', '0', '-5'])('rejects REFRESH_TOKEN_TTL_SECONDS=%s', (v) => {
    expect(parseEnv({ ...base, REFRESH_TOKEN_TTL_SECONDS: v })).toEqual({
      ok: false,
      issues: [{ name: 'REFRESH_TOKEN_TTL_SECONDS', reason: 'invalid' }],
    });
  });
});

describe('rate-limit defaults (approved: login 5/min, register 5/hour, refresh 30/min)', () => {
  it('uses the approved defaults when unset', () => {
    expect(parseEnv(base)).toMatchObject({
      ok: true,
      env: {
        LOGIN_RATE_LIMIT_MAX: 5,
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
        REGISTER_RATE_LIMIT_MAX: 5,
        REGISTER_RATE_LIMIT_WINDOW_SECONDS: 3600,
        REFRESH_RATE_LIMIT_MAX: 30,
        REFRESH_RATE_LIMIT_WINDOW_SECONDS: 60,
      },
    });
  });
});

describe('server startup with auth configuration', () => {
  const serverPath = fileURLToPath(new URL('../server.ts', import.meta.url));
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['--import', 'tsx', serverPath], {
      env: { PATH: process.env['PATH'] ?? '', ...env },
      encoding: 'utf8',
      timeout: 15_000,
    });
  const withoutSecret: Record<string, string> = { ...base };
  delete withoutSecret['JWT_SECRET'];

  it('exits non-zero naming JWT_SECRET when it is missing, without listening', () => {
    const result = run(withoutSecret);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET: missing');
    expect(result.stdout).not.toContain('listening');
  });

  it('exits non-zero for a short secret and prints neither the value nor a fragment of it', () => {
    const short = 'TOOSHORT-sentinel-value';
    const result = run({ ...base, JWT_SECRET: short });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET: invalid');
    expect(result.stderr + result.stdout).not.toContain(short);
    expect(result.stderr + result.stdout).not.toContain('sentinel');
  });
});
