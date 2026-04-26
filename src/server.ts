import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOrigins, env, isDevelopment } from '@/config/env';
import { logger } from '@/infra/logger';
import { initSentry, Sentry } from '@/infra/sentry';
import { connectDatabase, disconnectDatabase } from '@/infra/prisma';
import { requestLogger } from '@/middleware/request-logger';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { healthRoutes } from '@/modules/health/routes';
import { productRoutes } from '@/modules/products/routes';

/**
 * API entry point.
 *
 * Wiring order (matters!):
 *  1. Sentry.init — captures errors thrown during startup
 *  2. Sentry request handler — must be FIRST middleware
 *  3. Cross-cutting middleware: helmet, cors, json, request-logger
 *  4. Module routes mounted under /api/<module>
 *  5. Sentry error handler — must be just BEFORE our error handler
 *  6. 404 + error handlers — terminal middleware
 */

initSentry();

const app = express();

if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestLogger);

// --------------------------------------------------------------
// Module routes — Principle #7 (DDD) and #9 (Modular)
// Each module exports its own Router; the server just mounts them.
// --------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/products', productRoutes);

// Terminal handlers
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  await connectDatabase();
  app.listen(env.PORT, () => {
    logger.info('server.listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      cors: corsOrigins,
    });
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(`\n→ http://localhost:${env.PORT}/api/health\n`);
    }
  });
}

async function shutdown(signal: string) {
  logger.info('server.shutdown', { signal });
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

start().catch((err) => {
  logger.error('server.startup_failed', { error: err });
  process.exit(1);
});
