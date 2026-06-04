import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Typed environment loader (Rule B9 — Environment Variables).
 *
 * Reads `process.env`, validates with Zod, and exports a fully-typed `env`
 * object. The app refuses to start if a required variable is missing or
 * malformed. This keeps surprises out of production.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3737'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters'),

  // Phase 11.3 (audit H9) — symmetric key for at-rest secret
  // encryption (payment gateway credentials, etc.). Hex (64 chars =
  // 32 bytes) is the canonical form; any string ≥ 32 chars also
  // works (we SHA-256 it to derive the AES key). Required in
  // production; derived from JWT_SECRET in dev so existing setups
  // keep working.
  SECRETS_KEY: z.string().min(32).optional(),

  // Phase 11.3 (audit M5) — opt-in escape hatch to allow the stub
  // payment gateway in production. Default off; in production the
  // payments service throws rather than silently falling back to the
  // stub. Set to "1" only for staging-on-prod-NODE_ENV smoke tests.
  ALLOW_STUB_GATEWAY: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().optional(),

  WEB_URL: z.string().url().default('http://localhost:3737'),

  // Uploads — pluggable storage backend.
  // `local`: writes to UPLOADS_LOCAL_DIR, served via express.static at /uploads/*.
  // `r2`:    Cloudflare R2 (TODO — needs R2_* keys when provisioning lands).
  UPLOADS_BACKEND: z.enum(['local', 'r2']).default('local'),
  UPLOADS_LOCAL_DIR: z.string().default('./uploads'),
  UPLOADS_PUBLIC_URL_BASE: z
    .string()
    .url()
    .default('http://localhost:4000/uploads'),
  UPLOADS_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),

  // Cloudflare R2 (S3-compatible). Required when UPLOADS_BACKEND=r2.
  // R2_PUBLIC_URL_BASE is the bucket's public URL (custom domain like
  // https://images.afrizonemart.com or the r2.dev URL during testing).
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL_BASE: z.string().url().optional(),

  // Squad payment gateway (squadco.com). When SECRET + ENVIRONMENT are
  // both set, the real GtSquadGateway is selected; otherwise the stub
  // gateway handles everything for local dev.
  SQUAD_SECRET_KEY: z.string().optional(),
  SQUAD_ENVIRONMENT: z.enum(['sandbox', 'live']).optional(),
  // Public callback the customer is redirected back to after payment.
  // Defaults to localhost in dev — point at the live storefront in prod.
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),

  // Email delivery. When RESEND_API_KEY is set the ResendEmailProvider is
  // selected; otherwise the ConsoleEmailProvider just logs the rendered
  // HTML to the terminal — perfect for local dev without burning quota.
  RESEND_API_KEY: z.string().optional(),
  /// Tracker #49 — Svix-style webhook signing secret. Set this in
  /// Railway after adding the webhook endpoint in the Resend
  /// dashboard. Without it the /api/webhooks/resend endpoint
  /// rejects every delivery (no signature → no trust).
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().default('Afrizonemart <no-reply@afrizonemart.com>'),
  EMAIL_REPLY_TO: z.string().optional(),

  /// WhatsApp Cloud API — admin order-alert pipeline. When all four
  /// are set the MetaCloudWhatsAppProvider is selected; otherwise
  /// the ConsoleWhatsAppProvider logs the rendered message to stdout
  /// (dev / no-cost mode). See [[whatsapp-admin-alerts]] memory for
  /// the Meta Business Manager setup steps Magnus owns.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  /// Name of the approved template message on Meta Business
  /// Manager. The template MUST take 4 positional parameters in
  /// this order: orderNumber, total (formatted), customerName,
  /// adminUrl. Until the template is approved, leave this unset and
  /// the provider falls back to Console.
  WHATSAPP_TEMPLATE_NAME: z.string().optional(),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  /// Single recipient phone number in E.164 format (e.g.
  /// "+2348012345678"). Comma-separated multiple recipients are
  /// supported but #1 use case is "send to Magnus's WhatsApp".
  ORDER_NOTIFY_WHATSAPP_TO: z.string().optional(),

  // Google OAuth — when set, the storefront's "Continue with Google"
  // button is enabled. The same client id is exposed on the frontend
  // via NEXT_PUBLIC_GOOGLE_CLIENT_ID.
  GOOGLE_CLIENT_ID: z.string().optional(),

  // Twilio Verify — phone/SMS auth. When all three are set, the
  // /api/auth/phone/* endpoints are functional. Without them they
  // return a clear "phone auth not configured" error.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SID: z.string().optional(),

  // Phase 11.2 — GIG Logistics shipping provider. When all three are
  // set the GIG quote provider participates in checkout pricing,
  // returning live "GIG Standard" / "GIG Express" rates alongside our
  // manual rate card. Without them the provider returns no quotes and
  // checkout falls through to the manual provider.
  GIG_API_KEY: z.string().optional(),
  GIG_USERNAME: z.string().optional(),
  GIG_PASSWORD: z.string().optional(),
  /// Default sender info for the quote — GIG needs an origin city to
  /// compute pricing. Defaults to Lagos when unset.
  GIG_ORIGIN_CITY: z.string().default('Lagos'),
  GIG_ORIGIN_STATE: z.string().default('Lagos'),

  // Background-removal provider for the "Share as image" feature.
  // Selection order at boot:
  //   1. CloudflareImagesProvider — picked when CF_TRANSFORM_DOMAIN is
  //      set. Uses Cloudflare's segment=foreground URL transform on a
  //      zone where Image Transformations is enabled. ~5,000 free
  //      transformations/month, then $0.50/1,000. No API key needed.
  //      This is the preferred provider.
  //   2. RemoveBgProvider — picked when REMOVE_BG_API_KEY is set and
  //      no CF domain. Premium-quality output, ~$0.20/image. Kept as
  //      a fallback for cases where CF transform doesn't satisfy
  //      (hair-edge precision, etc.).
  //   3. NoopProvider — when neither env is set. Returns the original
  //      image; the share card still renders (in the Inset variant)
  //      but without the floating-product effect.
  CF_TRANSFORM_DOMAIN: z.string().optional(),
  REMOVE_BG_API_KEY: z.string().optional(),
});

// Bulk-upload CSVs can be larger than the default 1mb express body limit.
// We bump it via app.use(express.json({ limit: '8mb' })) at the bulk
// route level — see modules/products/admin.routes.ts.

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
