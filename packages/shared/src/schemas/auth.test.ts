import { describe, expect, it } from 'vitest';
import {
  authTokensSchema,
  loginRequestSchema,
  normalizeEmail,
  refreshRequestSchema,
  registerRequestSchema,
  userSchema,
} from '../index.js';

// FRS-AUTH-001/002/003 shared contract. Policy: OPEN-12 (password 12..128 chars, no
// composition rules), email normalization = trim + lowercase only (no dot/plus stripping).
const SENTINEL = 'SENTINEL_pw_value';
const okPassword = 'correct horse battery';

describe('normalizeEmail (FRS-AUTH-001)', () => {
  it('trims surrounding whitespace and lowercases', () => {
    expect(normalizeEmail('  Alice@Example.COM \t')).toBe('alice@example.com');
  });

  it('does not strip dots or plus aliases', () => {
    expect(normalizeEmail('A.Li+Notes@Example.com')).toBe('a.li+notes@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail(' Bob@Example.com ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('maps differently-cased/spaced forms of one address to the same value', () => {
    expect(normalizeEmail('USER@x.io')).toBe(normalizeEmail(' user@X.io '));
  });
});

describe('registerRequestSchema (FRS-AUTH-001)', () => {
  it('accepts a valid email and password', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: okPassword }).success,
    ).toBe(true);
  });

  it('accepts an email with surrounding whitespace and mixed case, yielding the normalized identity', () => {
    const r = registerRequestSchema.safeParse({ email: '  A@Example.com ', password: okPassword });
    expect(r.success).toBe(true);
    if (r.success) expect(normalizeEmail(r.data.email)).toBe('a@example.com');
  });

  it.each(['', 'plain', 'a@', '@example.com', 'a b@example.com'])(
    'rejects malformed email %j',
    (email) => {
      expect(registerRequestSchema.safeParse({ email, password: okPassword }).success).toBe(false);
    },
  );

  it('accepts password of exactly 12 and exactly 128 characters (boundaries)', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: 'a'.repeat(12) }).success,
    ).toBe(true);
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: 'a'.repeat(128) })
        .success,
    ).toBe(true);
  });

  it('rejects password of 11 and 129 characters', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: 'a'.repeat(11) }).success,
    ).toBe(false);
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: 'a'.repeat(129) })
        .success,
    ).toBe(false);
  });

  it('imposes no composition rules (all lowercase letters is fine)', () => {
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: 'abcdefghijkl' }).success,
    ).toBe(true);
  });

  it('rejects missing fields and wrong types', () => {
    expect(registerRequestSchema.safeParse({}).success).toBe(false);
    expect(registerRequestSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ email: 1, password: okPassword }).success).toBe(false);
    expect(
      registerRequestSchema.safeParse({ email: 'a@example.com', password: 123456789012 }).success,
    ).toBe(false);
    expect(registerRequestSchema.safeParse(null).success).toBe(false);
  });

  it('never echoes the rejected password in its issues', () => {
    const r = registerRequestSchema.safeParse({
      email: 'a@example.com',
      password: SENTINEL.repeat(20),
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).not.toContain(SENTINEL);
  });
});

describe('loginRequestSchema (FRS-AUTH-002)', () => {
  it('accepts email and password', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'a@example.com', password: okPassword }).success,
    ).toBe(true);
  });

  it('rejects missing or empty fields', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@example.com' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ password: okPassword }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ email: 'a@example.com', password: '' }).success).toBe(
      false,
    );
    expect(loginRequestSchema.safeParse({ email: '', password: okPassword }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(loginRequestSchema.safeParse({ email: 'nope', password: okPassword }).success).toBe(
      false,
    );
  });
});

describe('refreshRequestSchema (FRS-AUTH-003, OPEN-1 JSON body)', () => {
  it('accepts a non-empty refreshToken string', () => {
    expect(refreshRequestSchema.safeParse({ refreshToken: 'abc' }).success).toBe(true);
  });

  it.each([{}, { refreshToken: '' }, { refreshToken: 5 }, { refreshToken: null }])(
    'rejects %j',
    (body) => {
      expect(refreshRequestSchema.safeParse(body).success).toBe(false);
    },
  );
});

describe('response schemas', () => {
  it('authTokensSchema requires accessToken and refreshToken', () => {
    expect(authTokensSchema.safeParse({ accessToken: 'a', refreshToken: 'r' }).success).toBe(true);
    expect(authTokensSchema.safeParse({ accessToken: 'a' }).success).toBe(false);
    expect(authTokensSchema.safeParse({ refreshToken: 'r' }).success).toBe(false);
  });

  const user = {
    id: '3f2b8c1e-6a4d-4b7e-9c1a-2d5e8f7a9b0c',
    email: 'a@example.com',
    createdAt: '2026-10-22T10:00:00.000Z',
  };

  it('userSchema accepts id (uuid), email and ISO createdAt', () => {
    expect(userSchema.safeParse(user).success).toBe(true);
  });

  it('userSchema rejects a non-uuid id', () => {
    expect(userSchema.safeParse({ ...user, id: '123' }).success).toBe(false);
  });

  it('userSchema never carries a password or hash through', () => {
    const r = userSchema.safeParse({ ...user, passwordHash: 'x', password: 'y' });
    if (r.success) {
      expect(r.data).not.toHaveProperty('passwordHash');
      expect(r.data).not.toHaveProperty('password');
    }
  });
});
