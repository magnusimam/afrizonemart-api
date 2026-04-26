import * as Sentry from '@sentry/node';
import { env, isProduction } from '@/config/env';
import { logger } from './logger';

/**
 * Sentry initialisation (Principle #10 — Observability).
 *
 * Captures unhandled exceptions, request errors, and (later) traces.
 * If SENTRY_DSN isn't set we skip silently — perfect for local dev.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.info('sentry.skipped', { reason: 'SENTRY_DSN not configured' });
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
  });

  logger.info('sentry.initialised', { environment: env.NODE_ENV });
}

export { Sentry };
