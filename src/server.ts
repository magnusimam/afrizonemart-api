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
import { fxRoutes } from '@/modules/fx/routes';
import { categoryRoutes } from '@/modules/categories/routes';
import { startWebhookDispatcher } from '@/modules/webhooks/dispatcher';
import { startNotificationDispatcher } from '@/modules/notifications/dispatcher';
import { startAbandonedCartCron } from '@/modules/cart/abandoned-cron';

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

// Railway / Cloudflare puts a proxy in front of us — trust the first
// hop so express-rate-limit (and other IP-aware middleware) sees the
// real client IP from `X-Forwarded-For`.
app.set('trust proxy', 1);

if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// helmet's cross-origin-resource-policy=same-origin would block the
// frontend (different port in dev) from loading uploaded images. Loosen
// it to cross-origin so /uploads/* assets render on the storefront.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: allow our explicit list (CORS_ORIGINS env) plus any Vercel
// per-deploy URL under our project. Vercel mints a unique URL for every
// `vercel --prod` build (like `afrizonemart-xyz123-imammagnus40-…vercel.app`),
// and we want those to work without re-deploying the API every time.
const VERCEL_PROJECT_PREVIEW =
  /^https:\/\/afrizonemart-[a-z0-9]+-imammagnus40-8846s-projects\.vercel\.app$/i;

// In development we allow any localhost port — Next.js falls back to
// 3001/3002/etc. when 3000 is taken and we shouldn't break the inner
// loop over an env list.
const LOCALHOST_ANY_PORT = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server have no Origin header.
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      if (VERCEL_PROJECT_PREVIEW.test(origin)) return cb(null, true);
      if (isDevelopment && LOCALHOST_ANY_PORT.test(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin "${origin}" not allowed`), false);
    },
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
app.use('/api/fx', fxRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRouter);

// Terminal handlers
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  await connectDatabase();
  startWebhookDispatcher();
  startNotificationDispatcher();
  startAbandonedCartCron();
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
