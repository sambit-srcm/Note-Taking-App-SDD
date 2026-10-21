import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

let shared: PrismaClient | undefined;

export function getPrismaClient(databaseUrl: string): PrismaClient {
  shared ??= createPrismaClient(databaseUrl);
  return shared;
}
