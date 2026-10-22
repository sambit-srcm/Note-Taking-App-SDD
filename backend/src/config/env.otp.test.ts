import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatEnvIssues, parseEnv } from './env.js';

// runtime-configuration delta (AB-1003): OTP_SECRET and reset rate-limit defaults.
// Approved: OTP_SECRET min 32 chars; `change-me` placeholder rejected when NODE_ENV=production;
// request 5/hour, confirm 10 per 15 min. Exact names of the rate-limit variables are the
// engineer's choice, so only OTP_SECRET is asserted by name here.
const OTP_SECRET = 'OTPSECRET-sentinel-0123456789-abcdefghijkl';
const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'S3CRET-sentinel-0123456789-abcdefghijklmnop',
  OTP_SECRET,
};

describe('OTP_SECRET', () => {
  it('accepts a secret of 32 or more characters', () => {
    expect(parseEnv(base)).toMatchObject({ ok: true, env: { OTP_SECRET } });
    expect(parseEnv({ ...base, OTP_SECRET: 'x'.repeat(32) }).ok).toBe(true);
  });

  it('reports a missing secret by name', () => {
    expect(parseEnv({ ...base, OTP_SECRET: undefined })).toEqual({
      ok: false,
      issues: [{ name: 'OTP_SECRET', reason: 'missing' }],
    });
  });

  it('treats an empty secret as missing', () => {
    expect(parseEnv({ ...base, OTP_SECRET: '' })).toEqual({
      ok: false,
      issues: [{ name: 'OTP_SECRET', reason: 'missing' }],
    });
  });

  it('rejects a secret shorter than 32 characters without echoing it', () => {
    const short = 'SHORTOTP-' + 'y'.repeat(22); // 31 chars
    expect(short.length).toBe(31);
    const result = parseEnv({ ...base, OTP_SECRET: short });
    expect(result).toEqual({ ok: false, issues: [{ name: 'OTP_SECRET', reason: 'invalid' }] });
    expect(JSON.stringify(result)).not.toContain('SHORTOTP');
    expect(formatEnvIssues(result.ok ? [] : result.issues).join('\n')).toBe('OTP_SECRET: invalid');
  });

  it('rejects the change-me placeholder when NODE_ENV=production', () => {
    const result = parseEnv({ ...base, NODE_ENV: 'production', OTP_SECRET: 'change-me' });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((i) => i.name)).toContain('OTP_SECRET');
  });

  it('accepts a real 32+ char secret in production', () => {
    // Guard: a legitimate 32+ char secret is accepted in production.
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).ok).toBe(true);
  });

  it('never exposes a valid secret in issues raised by other variables', () => {
    const result = parseEnv({ ...base, PORT: 'abc' });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(OTP_SECRET);
  });
});

describe('reset rate-limit defaults', () => {
  it('parses successfully with no reset rate-limit variables set (defaults apply)', () => {
    expect(parseEnv(base).ok).toBe(true);
  });
});

describe('server startup with OTP configuration', () => {
  const serverPath = fileURLToPath(new URL('../server.ts', import.meta.url));
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['--import', 'tsx', serverPath], {
      env: { PATH: process.env['PATH'] ?? '', ...env },
      encoding: 'utf8',
      timeout: 15_000,
    });
  const withoutSecret: Record<string, string> = { ...base };
  delete withoutSecret['OTP_SECRET'];

  it('exits non-zero naming OTP_SECRET when it is missing, without listening', () => {
    const result = run(withoutSecret);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OTP_SECRET: missing');
    expect(result.stdout).not.toContain('listening');
  });

  it('exits non-zero for a short secret and prints neither the value nor a fragment', () => {
    const short = 'TOOSHORT-sentinel-otp';
    const result = run({ ...base, OTP_SECRET: short });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OTP_SECRET: invalid');
    expect(result.stderr + result.stdout).not.toContain(short);
    expect(result.stderr + result.stdout).not.toContain('sentinel');
  });

  it('exits non-zero for the change-me placeholder in production', () => {
    const result = run({ ...base, NODE_ENV: 'production', OTP_SECRET: 'change-me' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OTP_SECRET');
    expect(result.stdout).not.toContain('listening');
  });
});
