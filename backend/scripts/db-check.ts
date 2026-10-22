import { EnvError, formatEnvIssues, loadEnv } from '../src/config/env.js';
import { checkDatabase } from '../src/db/check.js';

try {
  const env = loadEnv();
  const result = await checkDatabase(env.DATABASE_URL);
  console.log(`database: ${result.ok ? 'ok' : result.reason}`);
  process.exit(result.ok ? 0 : 1);
} catch (err) {
  if (err instanceof EnvError) {
    console.error('Invalid environment configuration:');
    for (const line of formatEnvIssues(err.issues)) console.error(`  ${line}`);
    process.exit(1);
  }
  throw err;
}
