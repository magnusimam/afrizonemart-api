import { Prisma, PrismaClient } from '@prisma/client';
import { isProduction } from '@/config/env';
import { logger } from './logger';

/**
 * Prisma client singleton.
 *
 * One client per process — never instantiate `new PrismaClient()` in route
 * handlers or you'll exhaust connection pools.
 */
const baseClient = new PrismaClient({
  log: isProduction ? ['error', 'warn'] : ['query', 'error', 'warn'],
});

const TRANSIENT_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 200;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrap every Prisma operation in a retry loop for transient connection
 * errors (Railway proxy disconnects, brief network blips). Permanent
 * errors and validation errors fall through unchanged on the first try.
 */
export const prisma = baseClient.$extends({
  query: {
    $allOperations: async ({ operation, model, args, query }) => {
      let attempt = 0;
      while (true) {
        try {
          return await query(args);
        } catch (err) {
          const code =
            err instanceof Prisma.PrismaClientKnownRequestError
              ? err.code
              : undefined;
          if (!code || !TRANSIENT_PRISMA_CODES.has(code) || attempt >= MAX_RETRIES) {
            throw err;
          }
          const wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
          logger.warn('prisma.transient_retry', {
            operation,
            model,
            code,
            attempt: attempt + 1,
            waitMs: wait,
          });
          await sleep(wait);
          attempt += 1;
        }
      }
    },
  },
});

export async function connectDatabase(): Promise<void> {
  // Initial connect doesn't go through the $extends retry — handle
  // Railway proxy hiccups here so server boot doesn't crash on a 1-blip.
  const STARTUP_RETRIES = 5;
  let attempt = 0;
  while (true) {
    try {
      await baseClient.$connect();
      logger.info('database.connected', { attempt: attempt + 1 });
      return;
    } catch (error) {
      attempt += 1;
      if (attempt > STARTUP_RETRIES) {
        logger.error('database.connection_failed', { error });
        throw error;
      }
      const wait = 1000 * attempt; // 1s, 2s, 3s, 4s, 5s
      logger.warn('database.connect_retry', {
        attempt,
        waitMs: wait,
        of: STARTUP_RETRIES,
      });
      await sleep(wait);
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await baseClient.$disconnect();
  logger.info('database.disconnected');
}
