import { describe, expect, it } from 'vitest';
import { checkDatabase } from './check.js';

// Requires PostgreSQL 16 (docker compose up -d) and DATABASE_URL. Run with `pnpm test:db`.
describe('database connectivity', () => {
  it('connects to the configured PostgreSQL through Prisma', async () => {
    const url = process.env['DATABASE_URL'];
    expect(url, 'DATABASE_URL must be set').toBeDefined();
    expect(await checkDatabase(url as string)).toEqual({ ok: true });
  });

  it('fails cleanly, leaking neither credentials nor host, when unreachable', async () => {
    const result = await checkDatabase('postgresql://user:SENTINEL_SECRET@127.0.0.1:1/unreachable');
    expect(result).toEqual({ ok: false, reason: 'unreachable' });
    expect(JSON.stringify(result)).not.toContain('SENTINEL_SECRET');
  });
});
