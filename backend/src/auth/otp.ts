import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from '@notes/shared';

/** Uniformly random numeric code, zero-padded to the fixed length. */
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

/** HMAC-SHA256 keyed by the server secret, bound to the challenge id; hex encoded. */
export function protectOtp(secret: string, challengeId: string, otp: string): string {
  return createHmac('sha256', secret)
    .update(challengeId + otp)
    .digest('hex');
}

/** Constant-time comparison of the protected form; never throws on malformed `stored`. */
export function verifyOtp(
  secret: string,
  challengeId: string,
  otp: string,
  stored: string,
): boolean {
  const expected = Buffer.from(protectOtp(secret, challengeId, otp), 'hex');
  const actual = Buffer.from(stored, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
