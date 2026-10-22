import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';

// FRS-AUTH-001: passwords stored only as secure hashes.
// ASSUMED INTERFACE (engineer's file not present when written):
//   hashPassword(password: string): Promise<string>
//   verifyPassword(password: string, hash: string): Promise<boolean>
const PASSWORD = 'correct horse battery staple';

describe('password hashing', () => {
  it('produces a hash that is not the plaintext and does not contain it', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).not.toBe(PASSWORD);
    expect(hash).not.toContain(PASSWORD);
    expect(hash.length).toBeGreaterThan(40);
  });

  it('uses argon2id (design decision 6)', async () => {
    expect(await hashPassword(PASSWORD)).toMatch(/^\$argon2id\$/);
  });

  it('salts: hashing the same password twice yields different hashes', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('verifies the correct password', async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true);
  });

  it('rejects a wrong password, including a near-miss', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword('wrong password entirely', hash)).toBe(false);
    expect(await verifyPassword(PASSWORD + ' ', hash)).toBe(false);
    expect(await verifyPassword(PASSWORD.toUpperCase(), hash)).toBe(false);
  });

  it('returns false (does not throw) for a malformed stored hash', async () => {
    expect(await verifyPassword(PASSWORD, 'not-a-hash')).toBe(false);
  });

  it('handles the maximum 128-character password and unicode', async () => {
    const long = 'é'.repeat(128);
    expect(await verifyPassword(long, await hashPassword(long))).toBe(true);
  });
});
