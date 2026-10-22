import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env: tests report the missing DATABASE_URL themselves.
}

export default defineConfig({
  test: { include: ['src/**/*.db.test.ts'] },
});
