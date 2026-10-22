import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Env = z.infer<typeof envSchema>;

// Fixed reason set: raw validator messages can echo input, so they are never surfaced.
export type EnvIssueReason = 'missing' | 'invalid';
export interface EnvIssue {
  name: string;
  reason: EnvIssueReason;
}
export type EnvResult = { ok: true; env: Env } | { ok: false; issues: EnvIssue[] };

export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };

  const names = new Set<string>();
  for (const issue of parsed.error.issues) {
    const name = issue.path[0];
    if (typeof name === 'string') names.add(name);
  }
  const issues = [...names].map((name): EnvIssue => {
    const value = source[name];
    return { name, reason: value === undefined || value === '' ? 'missing' : 'invalid' };
  });
  return { ok: false, issues };
}

export function formatEnvIssues(issues: EnvIssue[]): string[] {
  return issues.map((issue) => `${issue.name}: ${issue.reason}`);
}

export class EnvError extends Error {
  constructor(readonly issues: EnvIssue[]) {
    super('Invalid environment configuration');
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = parseEnv(source);
  if (!result.ok) throw new EnvError(result.issues);
  return result.env;
}
