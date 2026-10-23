import { createApp } from './app.js';
import { createPasswordResetService } from './auth/passwordReset.js';
import {
  noteWriteLimitFromEnv,
  rateLimitConfigFromEnv,
  resetRateLimitConfigFromEnv,
  searchLimitFromEnv,
} from './auth/rateLimit.js';
import { createAuthService } from './auth/service.js';
import { EnvError, formatEnvIssues, loadEnv } from './config/env.js';
import { getPrismaClient } from './db/prisma.js';
import { logger } from './http/logger.js';
import { createNoteService } from './notes/service.js';
import { createSearchService } from './search/service.js';
import { createTagService } from './tags/service.js';

try {
  const env = loadEnv();
  const prisma = getPrismaClient(env.DATABASE_URL);
  const auth = createAuthService({
    prisma,
    jwtSecret: env.JWT_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
  });
  const passwordReset = createPasswordResetService({
    prisma,
    otpSecret: env.OTP_SECRET,
    nodeEnv: env.NODE_ENV,
  });
  createApp({
    authService: auth,
    jwtSecret: env.JWT_SECRET,
    rateLimits: rateLimitConfigFromEnv(env),
    passwordResetService: passwordReset,
    resetRateLimits: resetRateLimitConfigFromEnv(env),
    noteService: createNoteService({ prisma }),
    noteWriteLimit: noteWriteLimitFromEnv(env),
    tagService: createTagService({ prisma }),
    searchService: createSearchService({ prisma }),
    searchLimit: searchLimitFromEnv(env),
  }).listen(env.PORT, () => logger.info('api listening', { port: env.PORT }));
} catch (err) {
  if (err instanceof EnvError) {
    console.error('Invalid environment configuration:');
    for (const line of formatEnvIssues(err.issues)) console.error(`  ${line}`);
    process.exit(1);
  }
  throw err;
}
