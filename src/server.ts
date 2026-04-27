import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { corsOrigins, env, isDevelopment } from '@/config/env';
import { logger } from '@/infra/logger';
import { initSentry, Sentry } from '@/infra/sentry';
import { connectDatabase, disconnectDatabase } from '@/infra/prisma';
import { requestLogger } from '@/middleware/request-logger';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { adminRouter } from '@/modules/admin/routes';
import { authRoutes } from '@/modules/auth/routes';
import { cartRoutes } from '@/modules/cart/routes';
import { healthRoutes } from '@/modules/health/routes';
import { orderRoutes } from '@/modules/orders/routes';
import { productRoutes } from '@/modules/products/routes';
import { shippingRoutes } from '@/modules/shipping/routes';
import { uploadRoutes } from '@/modules/uploads/routes';
import { paymentRoutes } from '@/modules/payments/routes';
import { customFieldRoutes } from '@/modules/custom-fields/routes';
import { featureFlagRoutes } from '@/modules/feature-flags/routes';
import { cmsRoutes } from '@/modules/cms/routes';
import { startWebhookDispatcher } from '@/modules/webhooks/dispatcher';
import { startNotificationDispatcher } from '@/modules/notifications/dispatcher';

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

// helmet's cross-origin-resource-policy=same-origin would block the
// frontend (different port in dev) from loading uploaded images. Loosen
// it to cross-origin so /uploads/* assets render on the storefront.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);

// Static serving for the local-disk uploads backend. In production with
// R2 this static handler is unused — assets come from R2's public URL.
if (env.UPLOADS_BACKEND === 'local') {
  app.use('/uploads', express.static(path.resolve(env.UPLOADS_LOCAL_DIR)));
}
// 8mb body cap — bigger than typical JSON payloads, but big enough for
// CSV bulk uploads of a few thousand rows. The `verify` callback also
// stashes the raw body on the request so webhook signature handlers
// (Squad's HMAC-SHA512 over the unmodified bytes, etc.) can verify
// against exactly what the gateway signed.
app.use(
  express.json({
    limit: '8mb',
    verify: (req, _res, buf) => {
      (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(cookieParser());
app.use(requestLogger);

// --------------------------------------------------------------
// Module routes — Principle #7 (DDD) and #9 (Modular)
// Each module exports its own Router; the server just mounts them.
// --------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/custom-fields', customFieldRoutes);
app.use('/api/flags', featureFlagRoutes);
app.use('/api/pages', cmsRoutes);
app.use('/api/admin', adminRouter);

// Terminal handlers
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  await connectDatabase();
  startWebhookDispatcher();
  startNotificationDispatcher();
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

// Safety net: never let an unhandled rejection take the API down. The
// per-route asyncHandler should catch everything before it reaches here,
// but if one slips through we report it and keep serving traffic.
process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  logger.error('process.unhandled_rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// uncaughtException leaves Node in an undefined state — log + exit so the
// supervisor (Railway, tsx watch in dev) restarts us cleanly.
process.on('uncaughtException', (err) => {
  Sentry.captureException(err);
  logger.error('process.uncaught_exception', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

start().catch((err) => {
  logger.error('server.startup_failed', { error: err });
  process.exit(1);
});
