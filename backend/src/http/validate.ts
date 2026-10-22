import type { ErrorField } from '@notes/shared';
import type { z } from 'zod';
import { ValidationError } from './errors.js';

// Only these fixed strings reach the client; zod messages are never forwarded.
function fixedMessage(code: string): string {
  switch (code) {
    case 'invalid_type':
      return 'A value of the expected type is required.';
    case 'too_small':
    case 'too_big':
      return 'The value length is out of the allowed range.';
    case 'invalid_format':
      return 'The value format is not valid.';
    default:
      return 'The value is not valid.';
  }
}

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const seen = new Set<string>();
  const fields: ErrorField[] = [];
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.');
    if (seen.has(path)) continue;
    seen.add(path);
    // `custom` issues come from our own refinements, whose messages are fixed literals.
    fields.push({
      path,
      message: issue.code === 'custom' ? issue.message : fixedMessage(issue.code),
    });
  }
  throw new ValidationError(fields);
}
