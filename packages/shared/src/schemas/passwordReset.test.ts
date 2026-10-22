import { describe, expect, it } from 'vitest';
import { OTP_LENGTH, passwordResetConfirmSchema, passwordResetRequestSchema } from '../index.js';

// FRS-AUTH-004 shared contract (AB-1003). Approved: OTP = exactly 6 ASCII digits,
// new password 12..128 code points (same policy as registration), email normalized
// (trim + lowercase). Error messages are fixed strings and never echo input.
const SENTINEL = 'SENTINEL_pw_value';
const okPassword = 'correct horse battery';
const base = { email: 'a@example.com', otp: '123456', newPassword: okPassword };
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  JSON.stringify(r.error?.issues ?? []);

describe('passwordResetRequestSchema', () => {
  it('accepts a well-formed email and normalizes it', () => {
    const r = passwordResetRequestSchema.safeParse({ email: '  Alice@Example.COM ' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ email: 'alice@example.com' });
  });

  it.each([
    ['malformed', { email: 'not-an-email' }],
    ['missing', {}],
    ['empty', { email: '' }],
    ['non-string', { email: 42 }],
    ['too long', { email: `${'a'.repeat(250)}@example.com` }],
  ])('rejects %s email', (_n, body) => {
    expect(passwordResetRequestSchema.safeParse(body).success).toBe(false);
  });

  it('does not echo the submitted email in error messages', () => {
    const r = passwordResetRequestSchema.safeParse({ email: 'SENTINEL-not-an-email' });
    expect(r.success).toBe(false);
    expect(messages(r)).not.toContain('SENTINEL');
  });
});

describe('passwordResetConfirmSchema', () => {
  it('uses a 6 digit OTP constant', () => {
    expect(OTP_LENGTH).toBe(6);
  });

  it('accepts the valid shape and normalizes the email', () => {
    const r = passwordResetConfirmSchema.safeParse({ ...base, email: ' A@Example.com ' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ...base, email: 'a@example.com' });
  });

  it('accepts leading zeros in the OTP', () => {
    expect(passwordResetConfirmSchema.safeParse({ ...base, otp: '000123' }).data?.otp).toBe(
      '000123',
    );
  });

  it.each([
    '12345',
    '1234567',
    '',
    'abcdef',
    '12345a',
    '12 456',
    ' 123456',
    '123456 ',
    '１２３４５６', // full-width digits
    '١٢٣٤٥٦', // arabic-indic digits
    '12.456',
    '-12345',
    '+12345',
    '1e5555',
  ])('rejects OTP %j', (otp) => {
    expect(passwordResetConfirmSchema.safeParse({ ...base, otp }).success).toBe(false);
  });

  it.each([123456, null, undefined, ['123456']])('rejects non-string OTP %j', (otp) => {
    expect(passwordResetConfirmSchema.safeParse({ ...base, otp }).success).toBe(false);
  });

  it('accepts password bounds 12 and 128 and rejects 11 and 129', () => {
    const ok = (n: number) =>
      passwordResetConfirmSchema.safeParse({ ...base, newPassword: 'p'.repeat(n) }).success;
    expect(ok(12)).toBe(true);
    expect(ok(128)).toBe(true);
    expect(ok(11)).toBe(false);
    expect(ok(129)).toBe(false);
  });

  it('counts code points, not UTF-16 units, for the password', () => {
    const emoji = (n: number) => '😀'.repeat(n);
    const ok = (p: string) =>
      passwordResetConfirmSchema.safeParse({ ...base, newPassword: p }).success;
    expect(ok(emoji(12))).toBe(true);
    expect(ok(emoji(128))).toBe(true);
    expect(ok(emoji(129))).toBe(false);
    expect(ok(emoji(11))).toBe(false);
  });

  it.each([
    ['missing email', { otp: '123456', newPassword: okPassword }],
    ['missing otp', { email: 'a@example.com', newPassword: okPassword }],
    ['missing newPassword', { email: 'a@example.com', otp: '123456' }],
    ['non-string password', { ...base, newPassword: 123456789012 }],
    ['malformed email', { ...base, email: 'nope' }],
    ['empty object', {}],
  ])('rejects %s', (_n, body) => {
    expect(passwordResetConfirmSchema.safeParse(body).success).toBe(false);
  });

  it('does not echo the password or OTP in any error message', () => {
    const r = passwordResetConfirmSchema.safeParse({
      email: 'a@example.com',
      otp: 'SENTINEL1',
      newPassword: SENTINEL,
    });
    expect(r.success).toBe(false);
    const text = messages(r);
    expect(text).not.toContain('SENTINEL');
    expect(text).not.toContain(SENTINEL);
  });
});
