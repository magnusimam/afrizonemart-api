import { PrismaClient } from '@prisma/client';
import { isProduction } from '@/config/env';
import { logger } from './logger';

/**
 * Prisma client singleton.
 *
 * One client per process — never instantiate `new PrismaClient()` in route
 * handlers or you'll exhaust connection pools.
 */
export const prisma = new PrismaClient({
  log: isProduction
    ? ['error', 'warn']
    : ['query', 'error', 'warn'],
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('database.connected');
  } catch (error) {
    logger.error('database.connection_failed', { error });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('database.disconnected');
}
