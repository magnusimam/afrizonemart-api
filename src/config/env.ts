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
  EMAIL_FROM: z.string().default('Afrizonemart <no-reply@afrizonemart.com>'),
  EMAIL_REPLY_TO: z.string().optional(),

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
