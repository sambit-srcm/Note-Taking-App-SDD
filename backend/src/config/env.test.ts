import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EnvError, formatEnvIssues, loadEnv, parseEnv } from './env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'test-only-secret-0123456789-abcdefghij',
};
const SENTINEL = 'SENTINEL_SECRET_VALUE';

describe('parseEnv', () => {
  it('accepts valid variables and coerces PORT', () => {
    const result = parseEnv(valid);
    expect(result).toMatchObject({ ok: true, env: { ...valid, PORT: 3000 } });
  });

  it('reports a missing variable by name', () => {
    expect(parseEnv({ ...valid, DATABASE_URL: undefined })).toEqual({
      ok: false,
      issues: [{ name: 'DATABASE_URL', reason: 'missing' }],
    });
  });

  it('treats an empty string as missing', () => {
    expect(parseEnv({ ...valid, PORT: '' })).toEqual({
      ok: false,
      issues: [{ name: 'PORT', reason: 'missing' }],
    });
  });

  it.each(['abc', '0', '70000', '3000.5'])('rejects PORT=%s as invalid', (PORT) => {
    expect(parseEnv({ ...valid, PORT })).toEqual({
      ok: false,
      issues: [{ name: 'PORT', reason: 'invalid' }],
    });
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(parseEnv({ ...valid, NODE_ENV: 'staging' })).toMatchObject({ ok: false });
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    const result = parseEnv({ ...valid, DATABASE_URL: 'mysql://user:pass@localhost/db' });
    expect(result).toEqual({ ok: false, issues: [{ name: 'DATABASE_URL', reason: 'invalid' }] });
  });

  it('never echoes a supplied value in its issues or formatted output', () => {
    const result = parseEnv({ ...valid, DATABASE_URL: `not a url ${SENTINEL}`, PORT: SENTINEL });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(formatEnvIssues(result.issues).join('\n')).not.toContain(SENTINEL);
    expect(formatEnvIssues(result.issues)).toEqual(['PORT: invalid', 'DATABASE_URL: invalid']);
  });
});

describe('loadEnv', () => {
  it('returns the parsed env', () => {
    expect(loadEnv(valid).PORT).toBe(3000);
  });

  it('throws EnvError carrying the issues', () => {
    try {
      loadEnv({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).issues.map((i) => i.name).sort()).toEqual([
        'DATABASE_URL',
        'JWT_SECRET',
        'NODE_ENV',
        'PORT',
      ]);
    }
  });
});

describe('.env.example', () => {
  it('passes configuration validation as shipped', () => {
    const path = fileURLToPath(new URL('../../../.env.example', import.meta.url));
    const source: Record<string, string> = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) source[match[1]] = match[2];
    }
    expect(parseEnv(source).ok).toBe(true);
  });
});

describe('server startup', () => {
  const serverPath = fileURLToPath(new URL('../server.ts', import.meta.url));
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['--import', 'tsx', serverPath], {
      env: { PATH: process.env['PATH'] ?? '', ...env },
      encoding: 'utf8',
      timeout: 15_000,
    });

  it('exits non-zero naming the missing variable, without listening', () => {
    const result = run({ NODE_ENV: valid.NODE_ENV, PORT: valid.PORT });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL: missing');
    expect(result.stdout).not.toContain('listening');
  });

  it('does not print the value of an invalid variable', () => {
    const result = run({ ...valid, DATABASE_URL: `not a url ${SENTINEL}` });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL: invalid');
    expect(result.stderr + result.stdout).not.toContain(SENTINEL);
  });
});
