import { createPrismaClient } from './prisma.js';

// The failure result deliberately carries no driver message: it can contain host or credentials.
export type DatabaseCheck = { ok: true } | { ok: false; reason: 'unreachable' };

export async function checkDatabase(databaseUrl: string): Promise<DatabaseCheck> {
  const prisma = createPrismaClient(databaseUrl);
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unreachable' };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
