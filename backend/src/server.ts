import { createApp } from './app.js';
import { EnvError, formatEnvIssues, loadEnv } from './config/env.js';
import { logger } from './http/logger.js';

try {
  const env = loadEnv();
  createApp().listen(env.PORT, () => logger.info('api listening', { port: env.PORT }));
} catch (err) {
  if (err instanceof EnvError) {
    console.error('Invalid environment configuration:');
    for (const line of formatEnvIssues(err.issues)) console.error(`  ${line}`);
    process.exit(1);
  }
  throw err;
}
