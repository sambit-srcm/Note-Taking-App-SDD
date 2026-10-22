// Identity/uniqueness policy: trim surrounding whitespace and lowercase only.
// Dots and plus aliases are never stripped.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
