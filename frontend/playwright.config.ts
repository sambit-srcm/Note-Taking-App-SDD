import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:5173';

function envFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match?.[1] && match[2] !== undefined) {
        const value = match[2];
        values[match[1]] = value.replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // The API server reports a missing variable itself.
  }
  return values;
}

const apiEnv = {
  ...envFile(new URL('../.env', import.meta.url).pathname),
  VITE_API_URL: 'http://127.0.0.1:3000',
  JWT_SECRET: 'e2e-jwt-secret-0123456789abcdef-extra',
  OTP_SECRET: 'e2e-otp-secret-0123456789abcdef-extra',
  WEB_ORIGIN: 'http://127.0.0.1:5173',
  LOGIN_RATE_LIMIT_MAX: '100',
  REGISTER_RATE_LIMIT_MAX: '100',
};

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env['CI'],
  reporter: 'list',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: '../backend',
      env: apiEnv,
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
      env: apiEnv,
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
});
