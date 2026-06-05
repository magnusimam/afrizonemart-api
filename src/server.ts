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
import { addressRoutes } from '@/modules/addresses/routes';
import { authRoutes } from '@/modules/auth/routes';
import { cartRoutes } from '@/modules/cart/routes';
import { healthRoutes } from '@/modules/health/routes';
import { appRoutes } from '@/modules/app/version-gate';
import { courierRoutes } from '@/modules/courier/routes';
import { orderRoutes } from '@/modules/orders/routes';
import { pushRoutes } from '@/modules/push/routes';
import { productRoutes } from '@/modules/products/routes';
import { shippingRoutes } from '@/modules/shipping/routes';
import { uploadRoutes } from '@/modules/uploads/routes';
import { paymentRoutes } from '@/modules/payments/routes';
import { paymentMethodRoutes } from '@/modules/payment-methods/routes';
import { marketingRoutes } from '@/modules/marketing/routes';
import { notificationRoutes } from '@/modules/notifications/routes';
import { customFieldRoutes } from '@/modules/custom-fields/routes';
import { featureFlagRoutes } from '@/modules/feature-flags/routes';
import { cmsRoutes } from '@/modules/cms/routes';
import { fxRoutes } from '@/modules/fx/routes';
import { categoryRoutes } from '@/modules/categories/routes';
import { shelfRoutes } from '@/modules/shelves/routes';
import { wishlistRoutes } from '@/modules/wishlist/routes';
import { reviewRoutes } from '@/modules/reviews/routes';
import { viewRoutes } from '@/modules/views/routes';
import { startViewMaintenanceCron } from '@/modules/views/cron';
import { shareImageRoutes } from '@/modules/share-image/routes';
import { loyaltyRoutes } from '@/modules/loyalty/routes';
import { startLoyaltyEarnSubscriber } from '@/modules/loyalty/subscriber';
import { startLoyaltyMaintenanceCron } from '@/modules/loyalty/cron';
import { seedDefaultShelves } from '@/modules/shelves/service';
import { seedRegisteredFlags } from '@/modules/feature-flags/service';
import { blogRoutes } from '@/modules/blog/routes';
import { contentRoutes } from '@/modules/content/routes';
import { internRoutes } from '@/modules/intern/routes';
import { productSubmissionRoutes } from '@/modules/product-submissions/routes';
import { startScheduledBlogCron } from '@/modules/blog/cron';
import { startWebhookDispatcher } from '@/modules/webhooks/dispatcher';
import { startNotificationDispatcher } from '@/modules/notifications/dispatcher';
import { startWhatsAppDispatcher } from '@/modules/notifications/whatsapp-dispatcher';
import { startPushDispatcher } from '@/modules/notifications/push-dispatcher';
import { startCourierAutoMarkCron } from '@/modules/courier/auto-mark-cron';
import { initServerAnalytics } from '@/modules/analytics/analytics';
import { startAnalyticsDispatcher } from '@/modules/analytics/dispatcher';
import { startAbandonedCartCron } from '@/modules/cart/abandoned-cron';
import { startPaymentReconciliationCron } from '@/modules/payments/reconciliation-cron';
import { ensureCoreCategories } from '@/infra/ensure-categories';

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

// Phase 11.3 (audit H10) — full helmet config.
//
// crossOriginResourcePolicy stays `cross-origin` so the storefront can
// load `/uploads/*` from a different origin in dev (and from
// `images.afrizonemart.com` in prod, served by R2 anyway).
//
// Everything else is hardened:
//  - hsts forces HTTPS on api.afrizonemart.com (1y, includeSubDomains,
//    preload-eligible).
//  - frameguard / frame-ancestors deny — the API should never be
//    framed; nothing here is meant to be embedded.
//  - noSniff — important alongside the upload-MIME work (audit H8);
//    blocks browsers from re-typing an `image/png` upload as HTML
//    even if a future code path drops the `Content-Type: image/png`.
//  - referrerPolicy strict-origin-when-cross-origin — don't leak the
//    full URL (which can include order/payment refs) on outbound
//    redirects.
//  - contentSecurityPolicy: API responses are JSON, but the static
//    `/uploads/*` handler can serve HTML if a malicious upload
//    bypassed the MIME filter. `default-src 'none'` + `img-src 'self'`
//    means even if HTML did slip through, no scripts/iframes would
//    execute.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
      },
    },
  }),
);

// CORS: allow our explicit list (CORS_ORIGINS env) plus any Vercel
// per-deploy URL under our project. Vercel mints a unique URL for every
// `vercel --prod` build (like `afrizonemart-xyz123-imammagnus40-…vercel.app`),
// and we want those to work without re-deploying the API every time.
const VERCEL_PROJECT_PREVIEW =
  /^https:\/\/afrizonemart-[a-z0-9]+-imammagnus40-8846s-projects\.vercel\.app$/i;

// Phase 11.3 (audit M12): explicit dev allowlist. The earlier
// `any-localhost-port` regex combined with `credentials: true` meant
// any malicious page on any localhost port (a separate dev tool, an
// installed VS Code extension webview, anything spinning up a port
// during development) could make authenticated cross-origin calls.
// We pin to the storefront's known ports — Next.js falls back to
// 3001/3002 when 3000 is taken, so we list a small range explicitly
// rather than the unbounded regex.
const DEV_LOCALHOST_PORTS = new Set(['3000', '3001', '3002', '3737', '4000']);
function isDevLocalhostOrigin(origin: string): boolean {
  const m = /^http:\/\/(localhost|127\.0\.0\.1):(\d+)$/i.exec(origin);
  if (!m) return false;
  return DEV_LOCALHOST_PORTS.has(m[2]);
}

app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server have no Origin header.
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin)) return cb(null, true);
      if (VERCEL_PROJECT_PREVIEW.test(origin)) return cb(null, true);
      if (isDevelopment && isDevLocalhostOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin "${origin}" not allowed`), false);
    },
    credentials: true,
  }),
);

// Static serving for the local-disk uploads backend. In production with
// R2 this static handler is unused — assets come from R2's public URL.
// Phase 11.3 (audit M11): `dotfiles: 'deny'` so a stray `.env` or
// `.git` ending up in the uploads dir doesn't get served. `index:
// false` and `redirect: false` prevent directory listings and trailing-
// slash redirects to a parent. The risk is low (R2 in prod) but the
// fix is one option object.
if (env.UPLOADS_BACKEND === 'local') {
  app.use(
    '/uploads',
    express.static(path.resolve(env.UPLOADS_LOCAL_DIR), {
      dotfiles: 'deny',
      index: false,
      redirect: false,
    }),
  );
}
// Phase 11.3 (audit M10): per-path body limits. The previous global
// 8mb cap applied to /api/auth/login too — an attacker could DoS the
// auth endpoint with megabytes of garbage even before rate-limiting
// kicks in. Tighter default (1mb) covers every real route. Bulk
// admin endpoints get an 8mb override mounted BEFORE the global so
// they parse first; once they set req.body, the global parser sees
// it populated and skips. The `verify` callback stays on every
// parser because webhook handlers depend on `rawBody` for signature
// verification — the limit only changes, the rawBody capture does
// not.
const captureRawBody = (req: unknown, _res: unknown, buf: Buffer) => {
  (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
};
app.use(
  '/api/admin/products/bulk-upload',
  express.json({ limit: '8mb', verify: captureRawBody }),
);
app.use(
  '/api/admin/products/bulk',
  express.json({ limit: '8mb', verify: captureRawBody }),
);
app.use(
  express.json({ limit: '1mb', verify: captureRawBody }),
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(requestLogger);

// --------------------------------------------------------------
// Module routes — Principle #7 (DDD) and #9 (Modular)
// Each module exports its own Router; the server just mounts them.
// --------------------------------------------------------------
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/views', viewRoutes);
app.use('/api/share-image', shareImageRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/app', appRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/custom-fields', customFieldRoutes);
app.use('/api/flags', featureFlagRoutes);
app.use('/api/pages', cmsRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/content', contentRoutes);
/// Mount BEFORE /api/intern — the latter's catch-all gate is
/// products.image-only, which would 403 a product.submit-only intern
/// before this more-specific router runs. Express matches in order.
app.use('/api/intern/product-submissions', productSubmissionRoutes);
app.use('/api/intern', internRoutes);
app.use('/api/fx', fxRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/shelves', shelfRoutes);
app.use('/api/admin', adminRouter);

// Terminal handlers
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  await connectDatabase();
  await ensureCoreCategories();
  // Phase 10.8 — write a Shelf row for each registry placement key the
  // first time the API boots after the shelves migration. Idempotent;
  // safe to run on every start.
  try {
    const r = await seedDefaultShelves();
    if (r.created > 0 || r.refreshed > 0) {
      logger.info('shelves.seeded', {
        created: r.created,
        refreshed: r.refreshed,
      });
    }
  } catch (err) {
    logger.warn('shelves.seed_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // Phase 10.4 (resilience pattern) — index every code-registered
  // feature flag into the DB so it shows up in /admin/feature-flags
  // on first boot. Insert-only; admin overrides survive.
  try {
    const r = await seedRegisteredFlags();
    if (r.created > 0) {
      logger.info('feature_flags.seeded', {
        created: r.created,
        skipped: r.skipped,
      });
    }
  } catch (err) {
    logger.warn('feature_flags.seed_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  startWebhookDispatcher();
  startNotificationDispatcher();
  startWhatsAppDispatcher();
  startPushDispatcher();
  startCourierAutoMarkCron();
  initServerAnalytics();
  startAnalyticsDispatcher();
  startLoyaltyEarnSubscriber();
  startLoyaltyMaintenanceCron();
  startAbandonedCartCron();
  startScheduledBlogCron();
  /// 2026-05-16 — third safety net for paid-but-not-flipped orders.
  /// Every 5 min, re-verifies every PENDING_PAYMENT order against
  /// its gateway. Worst-case latency for a paid order to flip to
  /// PAID is bounded by this interval, even if both webhook and
  /// post-redirect verify fail.
  startPaymentReconciliationCron();
  /// Daily — prune ProductView rows older than 90 days. Keeps the
  /// trending aggregate table bounded.
  startViewMaintenanceCron();
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
