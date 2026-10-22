type Level = 'info' | 'error';

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'refreshtoken',
  'accesstoken',
  'token',
  'tokenhash',
  'authorization',
  'cookie',
  'secret',
  'jwt_secret',
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, message: string, context: Record<string, unknown> = {}): void {
  const safe = redact(context) as Record<string, unknown>;
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...safe });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),
};
