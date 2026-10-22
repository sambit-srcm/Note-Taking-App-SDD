import { randomUUID } from 'node:crypto';
import {
  normalizeEmail,
  passwordResetConfirmSchema,
  type PasswordResetConfirm,
} from '@notes/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { RateLimitedError, UnauthorizedError } from '../http/errors.js';
import { logger as defaultLogger } from '../http/logger.js';
import { parseBody } from '../http/validate.js';
import { generateOtp, protectOtp, verifyOtp } from './otp.js';
import { hashPassword } from './passwords.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
const newPasswordOnly = passwordResetConfirmSchema.pick({ newPassword: true });
const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000;

// One message for every OTP failure so a client cannot tell the causes apart.
const INVALID_OTP = 'The code is invalid or expired.';

export interface PasswordResetService {
  /** Resolves for any well-formed email; rejects only with the 60 s cooldown (429). */
  requestReset(email: string): Promise<void>;
  confirmReset(input: PasswordResetConfirm): Promise<void>;
  /** Idempotent: removes challenges expired, or consumed more than a day ago. Returns the count. */
  deleteExpiredChallenges(now: Date): Promise<number>;
}

export interface PasswordResetLogger {
  info(message: string, context?: Record<string, unknown>): void;
}

export interface PasswordResetServiceDeps {
  prisma: PrismaClient;
  otpSecret: string;
  logger?: PasswordResetLogger;
  now?: () => Date;
  nodeEnv: string;
}

export function createPasswordResetService(deps: PasswordResetServiceDeps): PasswordResetService {
  const { prisma, otpSecret, nodeEnv } = deps;
  const logger = deps.logger ?? defaultLogger;
  const now = deps.now ?? (() => new Date());
  // Unknown emails have no challenge row, so their cooldown lives here (keyed by email).
  const unknownRequests = new Map<string, number>();

  function checkUnknownCooldown(email: string, at: Date): void {
    for (const [key, ts] of unknownRequests) {
      if (at.getTime() - ts >= RESEND_COOLDOWN_MS) unknownRequests.delete(key);
    }
    const last = unknownRequests.get(email);
    if (last !== undefined && at.getTime() - last < RESEND_COOLDOWN_MS)
      throw new RateLimitedError();
    unknownRequests.set(email, at.getTime());
  }

  // Same HMAC work as a real check, so unknown or challenge-less accounts are not faster.
  function dummyWork(otp: string): void {
    verifyOtp(otpSecret, randomUUID(), otp, protectOtp(otpSecret, randomUUID(), generateOtp()));
  }

  return {
    async requestReset(rawEmail) {
      const email = normalizeEmail(rawEmail);
      const at = now();
      const user = await prisma.user.findUnique({
        where: { emailNormalized: email },
        select: { id: true },
      });
      if (!user) {
        // Same transaction shape as the known path (lock, latest-challenge lookup, HMAC) against
        // a random id, so response time does not trivially reveal that the account is missing.
        const ghostId = randomUUID();
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${ghostId}::uuid FOR UPDATE`;
          await tx.passwordResetChallenge.findFirst({
            where: { userId: ghostId },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          });
          dummyWork(generateOtp());
        });
        checkUnknownCooldown(email, at);
        return;
      }

      const otp = generateOtp();
      const challengeId = randomUUID();
      const otpHmac = protectOtp(otpSecret, challengeId, otp);
      await prisma.$transaction(async (tx) => {
        // Serialize concurrent requests for the same account before the cooldown check.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id}::uuid FOR UPDATE`;
        const last = await tx.passwordResetChallenge.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (last && at.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
          throw new RateLimitedError();
        }
        await tx.passwordResetChallenge.updateMany({
          where: { userId: user.id, consumedAt: null, invalidatedAt: null },
          data: { invalidatedAt: at },
        });
        await tx.passwordResetChallenge.create({
          data: {
            id: challengeId,
            userId: user.id,
            otpHmac,
            expiresAt: new Date(at.getTime() + OTP_TTL_MS),
            createdAt: at,
          },
        });
      });

      // Development only: no email delivery exists, so the console is the channel. The OTP is
      // in the message text on purpose; the structured-field redaction would hide it.
      if (nodeEnv === 'development') {
        logger.info(`Password reset OTP for ${email}: ${otp}`);
      }
    },

    async confirmReset({ email: rawEmail, otp, newPassword }) {
      // Policy first, before any DB access or OTP check, so a bad password burns nothing.
      parseBody(newPasswordOnly, { newPassword });
      const email = normalizeEmail(rawEmail);
      const user = await prisma.user.findUnique({
        where: { emailNormalized: email },
        select: { id: true },
      });
      if (!user) {
        dummyWork(otp);
        await hashPassword(newPassword); // keep the cost shape of the success path
        throw new UnauthorizedError(INVALID_OTP);
      }
      const passwordHash = await hashPassword(newPassword);

      // Failures return a result so attempt increments commit; thrown errors roll back.
      const outcome = await prisma.$transaction(async (tx) => {
        const at = now();
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "PasswordResetChallenge"
          WHERE "userId" = ${user.id}::uuid AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL
          ORDER BY "createdAt" DESC LIMIT 1 FOR UPDATE`;
        const locked = rows[0];
        const challenge = locked
          ? await tx.passwordResetChallenge.findUnique({ where: { id: locked.id } })
          : null;
        if (
          !challenge ||
          challenge.consumedAt !== null ||
          challenge.invalidatedAt !== null ||
          challenge.expiresAt <= at ||
          challenge.attempts >= OTP_MAX_ATTEMPTS
        ) {
          dummyWork(otp);
          return { ok: false as const };
        }
        if (!verifyOtp(otpSecret, challenge.id, otp, challenge.otpHmac)) {
          await tx.passwordResetChallenge.update({
            where: { id: challenge.id },
            data: { attempts: { increment: 1 } },
          });
          return { ok: false as const };
        }
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await tx.passwordResetChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: at },
        });
        await tx.refreshTokenSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: at },
        });
        return { ok: true as const };
      });
      if (!outcome.ok) throw new UnauthorizedError(INVALID_OTP);
    },

    async deleteExpiredChallenges(at) {
      const result = await prisma.passwordResetChallenge.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date(at.getTime() - CLEANUP_GRACE_MS) } },
            { consumedAt: { lt: new Date(at.getTime() - CLEANUP_GRACE_MS) } },
          ],
        },
      });
      return result.count;
    },
  };
}
