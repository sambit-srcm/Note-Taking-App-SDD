import { randomUUID } from 'node:crypto';
import {
  normalizeEmail,
  type AuthTokens,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from '@notes/shared';
import type { PrismaClient } from '../generated/prisma/client.js';
import { ConflictError, UnauthorizedError } from '../http/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from './tokens.js';

export interface AuthService {
  register(input: RegisterRequest): Promise<User>;
  login(input: LoginRequest): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  /** `userId`, when given, restricts the revocation to that owner's session. */
  logout(refreshToken: string, userId?: string): Promise<void>;
}

export interface AuthServiceDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  now?: () => Date;
}

const INVALID_CREDENTIALS = 'Invalid email or password.';
const INVALID_REFRESH = 'The refresh token is invalid or expired.';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { prisma, jwtSecret } = deps;
  const now = deps.now ?? (() => new Date());
  // Verified against when the email is unknown, so timing does not reveal existence.
  const dummyHash = hashPassword(randomUUID());

  async function issueTokens(
    userId: string,
    familyId: string,
    db: Pick<PrismaClient, 'refreshTokenSession'>,
  ): Promise<AuthTokens> {
    const issuedAt = now();
    const refreshToken = generateRefreshToken();
    await db.refreshTokenSession.create({
      data: {
        userId,
        familyId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(issuedAt.getTime() + deps.refreshTokenTtlSeconds * 1000),
      },
    });
    const accessToken = await signAccessToken({
      userId,
      secret: jwtSecret,
      ttlSeconds: deps.accessTokenTtlSeconds,
      now: issuedAt,
    });
    return { accessToken, refreshToken };
  }

  return {
    async register({ email: rawEmail, password }) {
      const email = normalizeEmail(rawEmail); // idempotent after schema normalization
      const passwordHash = await hashPassword(password);
      try {
        const user = await prisma.user.create({
          data: { email, emailNormalized: email, passwordHash },
          select: { id: true, email: true },
        });
        return { id: user.id, email: user.email };
      } catch (err) {
        if (isUniqueViolation(err)) throw new ConflictError('The email is already registered.');
        throw err;
      }
    },

    async login({ email: rawEmail, password }) {
      const email = normalizeEmail(rawEmail);
      const user = await prisma.user.findUnique({ where: { emailNormalized: email } });
      const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));
      if (!user || !ok) throw new UnauthorizedError(INVALID_CREDENTIALS);
      return issueTokens(user.id, randomUUID(), prisma);
    },

    async refresh(refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      // Reuse must revoke the family and still commit, so the transaction returns a
      // result instead of throwing; errors thrown inside roll everything back.
      const outcome = await prisma.$transaction(async (tx) => {
        const session = await tx.refreshTokenSession.findUnique({ where: { tokenHash } });
        if (!session) return { kind: 'invalid' as const };
        const at = now();
        if (session.rotatedAt !== null || session.revokedAt !== null) {
          await tx.refreshTokenSession.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: at },
          });
          return { kind: 'reuse' as const };
        }
        if (session.expiresAt <= at) return { kind: 'invalid' as const };
        // Conditional update: of two concurrent refreshes only one can match.
        const claimed = await tx.refreshTokenSession.updateMany({
          where: { id: session.id, rotatedAt: null, revokedAt: null },
          data: { rotatedAt: at, revokedAt: at },
        });
        if (claimed.count !== 1) {
          await tx.refreshTokenSession.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: at },
          });
          return { kind: 'reuse' as const };
        }
        const tokens = await issueTokens(session.userId, session.familyId, tx);
        return { kind: 'ok' as const, tokens };
      });
      if (outcome.kind !== 'ok') throw new UnauthorizedError(INVALID_REFRESH);
      return outcome.tokens;
    },

    async logout(refreshToken, userId) {
      const tokenHash = hashRefreshToken(refreshToken);
      const revoked = await prisma.refreshTokenSession.updateMany({
        where: { tokenHash, ...(userId !== undefined && { userId }), revokedAt: null },
        data: { revokedAt: now() },
      });
      if (revoked.count === 1) return;
      // Already-revoked own session is a no-op success; anything else is rejected.
      const existing = await prisma.refreshTokenSession.findFirst({
        where: { tokenHash, ...(userId !== undefined && { userId }) },
        select: { id: true },
      });
      if (!existing) throw new UnauthorizedError(INVALID_REFRESH);
    },
  };
}
