import { createApp } from './app.js';
import { rateLimitConfigFromEnv } from './auth/rateLimit.js';
import { createAuthService } from './auth/service.js';
import { EnvError, formatEnvIssues, loadEnv } from './config/env.js';
import { getPrismaClient } from './db/prisma.js';
import { logger } from './http/logger.js';

try {
  const env = loadEnv();
  const auth = createAuthService({
    prisma: getPrismaClient(env.DATABASE_URL),
    jwtSecret: env.JWT_SECRET,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
  });
  createApp({
    authService: auth,
    jwtSecret: env.JWT_SECRET,
    rateLimits: rateLimitConfigFromEnv(env),
  }).listen(env.PORT, () => logger.info('api listening', { port: env.PORT }));
} catch (err) {
  if (err instanceof EnvError) {
    console.error('Invalid environment configuration:');
    for (const line of formatEnvIssues(err.issues)) console.error(`  ${line}`);
    process.exit(1);
  }
  throw err;
}
