import { createHmac } from 'node:crypto';
import type * as NodeCrypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Wrap timingSafeEqual so the constant-time comparison path can be observed.
const tse = vi.hoisted(() => ({ calls: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();
  return {
    ...actual,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      tse.calls++;
      return actual.timingSafeEqual(a, b);
    },
  };
});

import { generateOtp, protectOtp, verifyOtp } from './otp.js';

// FRS-AUTH-004 / AB-1003 design decision 2. ASSUMED INTERFACE:
//   generateOtp(): string                                  6 ASCII digits, leading zeros kept
//   protectOtp(secret, challengeId, otp): string           HMAC-SHA256(secret, challengeId + otp)
//   verifyOtp(secret, challengeId, otp, stored): boolean   constant-time compare, never throws on junk
const SECRET = 'otp-unit-secret-0123456789-abcdefghijklmnop';
const OTHER_SECRET = 'otp-other-secret-0123456789-abcdefghijklmn';
const CID = '3f2b8c1e-6a4d-4b7e-9c1a-2d5e8f7a9b0c';
const CID2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const digestOf = (secret: string, cid: string, otp: string) =>
  createHmac('sha256', secret)
    .update(cid + otp)
    .digest();
const encodings = (d: Buffer) => [d.toString('hex'), d.toString('base64'), d.toString('base64url')];

beforeEach(() => {
  tse.calls = 0;
});

describe('generateOtp', () => {
  it('returns exactly 6 ASCII digits every time', () => {
    for (let i = 0; i < 2000; i++) expect(generateOtp()).toMatch(/^[0-9]{6}$/);
  });

  it('keeps leading zeros (string, not number)', () => {
    let seenLeadingZero = false;
    for (let i = 0; i < 5000 && !seenLeadingZero; i++)
      seenLeadingZero = generateOtp().startsWith('0');
    expect(seenLeadingZero).toBe(true);
  });

  it('is roughly uniform across digit positions and not constant', () => {
    const N = 6000;
    const counts = Array.from({ length: 6 }, () => new Array<number>(10).fill(0));
    const seen = new Set<string>();
    for (let i = 0; i < N; i++) {
      const otp = generateOtp();
      seen.add(otp);
      for (let p = 0; p < 6; p++) counts[p]![Number(otp[p])]!++;
    }
    expect(seen.size).toBeGreaterThan(N * 0.95);
    // Expected 600 per digit; 6 sigma is ~130. Wide bound keeps this non-flaky.
    for (const pos of counts) {
      for (const c of pos) {
        expect(c).toBeGreaterThan(400);
        expect(c).toBeLessThan(800);
      }
    }
  });
});

describe('protectOtp', () => {
  it('is HMAC-SHA256 over challengeId + otp keyed with the secret', () => {
    const stored = protectOtp(SECRET, CID, '012345');
    expect(typeof stored).toBe('string');
    expect(encodings(digestOf(SECRET, CID, '012345'))).toContain(stored);
  });

  it('never contains the OTP in plaintext, for any OTP value', () => {
    for (const otp of ['000000', '123456', '999999', '000001', '654321']) {
      const stored = protectOtp(SECRET, CID, otp);
      expect(stored).not.toContain(otp);
      expect(stored).not.toBe(otp);
      expect(stored.length).toBeGreaterThanOrEqual(32);
    }
  });

  it('is deterministic for identical inputs', () => {
    expect(protectOtp(SECRET, CID, '123456')).toBe(protectOtp(SECRET, CID, '123456'));
  });

  it('differs per challenge, per secret and per OTP', () => {
    const a = protectOtp(SECRET, CID, '123456');
    expect(protectOtp(SECRET, CID2, '123456')).not.toBe(a);
    expect(protectOtp(OTHER_SECRET, CID, '123456')).not.toBe(a);
    expect(protectOtp(SECRET, CID, '123457')).not.toBe(a);
  });

  it('is not an unkeyed hash (an offline SHA-256 table cannot reproduce it)', async () => {
    const { createHash } = await import('node:crypto');
    const stored = protectOtp(SECRET, CID, '123456');
    for (const input of ['123456', CID + '123456']) {
      expect(encodings(createHash('sha256').update(input).digest())).not.toContain(stored);
    }
  });
});

describe('verifyOtp', () => {
  const stored = protectOtp(SECRET, CID, '482913');

  it('accepts the correct OTP, challenge and secret', () => {
    expect(verifyOtp(SECRET, CID, '482913', stored)).toBe(true);
  });

  it.each([
    ['wrong otp', SECRET, CID, '482914'],
    ['otp with different leading zeros', SECRET, CID, '082913'],
    ['wrong challenge id', SECRET, CID2, '482913'],
    ['wrong secret', OTHER_SECRET, CID, '482913'],
    ['empty otp', SECRET, CID, ''],
    ['over-long otp', SECRET, CID, '4829130'],
  ])('rejects %s', (_n, secret, cid, otp) => {
    expect(verifyOtp(secret, cid, otp, stored)).toBe(false);
  });

  it.each([
    ['empty stored value', ''],
    ['short stored value', 'abc'],
    ['over-long stored value', 'a'.repeat(500)],
    ['non-encoded junk', '!!not-a-digest!!'],
  ])('returns false (does not throw) for %s', (_n, bad) => {
    expect(() => verifyOtp(SECRET, CID, '482913', bad)).not.toThrow();
    expect(verifyOtp(SECRET, CID, '482913', bad)).toBe(false);
  });

  it('compares through crypto.timingSafeEqual for a matching and a mismatching value', () => {
    verifyOtp(SECRET, CID, '482913', stored);
    expect(tse.calls).toBeGreaterThanOrEqual(1);
    const before = tse.calls;
    verifyOtp(SECRET, CID, '000000', stored);
    expect(tse.calls).toBeGreaterThan(before);
  });
});
