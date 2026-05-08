import * as Sentry from '@sentry/node';
import { env, isProduction } from '@/config/env';
import { logger } from './logger';

/// Phase 11.3 (audit M3): redacted body/query keys. These can show
/// up in any of the auth/payments/uploads flows; missing one means
/// shipping the secret straight to a third party. Match
/// case-insensitively because Express + browser headers normalise
/// inconsistently across runtimes.
const SENSITIVE_BODY_KEYS = new Set(
  [
    'password',
    'newpassword',
    'currentpassword',
    'oldpassword',
    'secretkey',
    'secrethash',
    'token',
    'tokenhash',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'nonce',
    'cardnumber',
    'cvv',
    'cvc',
    'creditcard',
    'pin',
  ].map((k) => k.toLowerCase()),
);

const SENSITIVE_HEADERS = new Set(
  [
    'authorization',
    'cookie',
    'set-cookie',
    'x-stub-signature',
    'x-squad-encrypted-body',
    'verif-hash',
    'x-flw-secret-hash',
  ].map((k) => k.toLowerCase()),
);

function scrubObject(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scrubObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scrubHeaders(headers: unknown): unknown {
  if (!headers || typeof headers !== 'object') return headers;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

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
    sendDefaultPii: false,
    // Phase 11.3 (audit M3): scrub PII / secrets before events leave
    // the process. Without this hook Sentry captures the full request
    // including Authorization headers, refresh-token cookies, and
    // password / token body fields — every prod error becomes a
    // credential leak.
    beforeSend(event) {
      if (event.request) {
        if (event.request.headers) {
          event.request.headers = scrubHeaders(event.request.headers) as typeof event.request.headers;
        }
        delete event.request.cookies;
        if (event.request.data) {
          event.request.data = scrubObject(event.request.data);
        }
        if (event.request.query_string && typeof event.request.query_string === 'object') {
          event.request.query_string = scrubObject(event.request.query_string) as typeof event.request.query_string;
        }
      }
      if (event.contexts && typeof event.contexts === 'object') {
        for (const ctxKey of Object.keys(event.contexts)) {
          event.contexts[ctxKey] = scrubObject(event.contexts[ctxKey]) as typeof event.contexts[typeof ctxKey];
        }
      }
      if (event.extra) {
        event.extra = scrubObject(event.extra) as typeof event.extra;
      }
      return event;
    },
  });

  logger.info('sentry.initialised', { environment: env.NODE_ENV });
}

export { Sentry };
