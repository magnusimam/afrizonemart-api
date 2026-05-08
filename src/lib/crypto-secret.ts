import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env, isProduction } from '@/config/env';

/**
 * Phase 11.3 (audit H9) — application-layer AES-256-GCM for secrets
 * stored in Postgres (payment gateway credentials, future API keys).
 *
 * **Threat model:** a Postgres dump leaks (stolen backup, dev `.dump`
 * checked into a repo, Railway support ticket). Without this layer
 * every secret in `PaymentGatewayConfig.credentials` is in cleartext
 * and an attacker can impersonate the merchant in production gateways.
 *
 * **Format:** values stored on disk as a tagged envelope so plaintext
 * rows from before this rolled out keep working. The migration
 * strategy is "next admin save re-encrypts" — no destructive
 * one-shot script needed. Mixed rows decrypt correctly:
 *   { _enc: 'v1', iv: 'hex', tag: 'hex', ct: 'hex' }
 */

const ENVELOPE_VERSION = 'v1' as const;

interface SecretEnvelope {
  _enc: typeof ENVELOPE_VERSION;
  iv: string;
  tag: string;
  ct: string;
}

let cachedKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (env.SECRETS_KEY) {
    // Hex form is canonical (32 bytes = 64 hex chars). Anything
    // else gets SHA-256'd so admins can paste a long passphrase
    // without doing the math themselves.
    if (/^[0-9a-fA-F]{64}$/.test(env.SECRETS_KEY)) {
      cachedKey = Buffer.from(env.SECRETS_KEY, 'hex');
    } else {
      cachedKey = createHash('sha256').update(env.SECRETS_KEY).digest();
    }
    return cachedKey;
  }
  if (isProduction) {
    throw new Error(
      'SECRETS_KEY env var is required in production (used to encrypt payment gateway credentials at rest).',
    );
  }
  // Dev fallback so existing setups keep working without a config
  // change. Tying to JWT_SECRET means rotating it would brick
  // encrypted credentials — fine for dev, not for prod (which is
  // why we require SECRETS_KEY above).
  cachedKey = createHash('sha256').update('azm:secrets:').update(env.JWT_SECRET).digest();
  return cachedKey;
}

function isEnvelope(value: unknown): value is SecretEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _enc?: unknown })._enc === ENVELOPE_VERSION &&
    typeof (value as { iv?: unknown }).iv === 'string' &&
    typeof (value as { tag?: unknown }).tag === 'string' &&
    typeof (value as { ct?: unknown }).ct === 'string'
  );
}

export function encryptSecret(plaintext: string): SecretEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    _enc: ENVELOPE_VERSION,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ct: ct.toString('hex'),
  };
}

export function decryptSecret(value: unknown): string {
  if (typeof value === 'string') return value; // legacy plaintext row
  if (!isEnvelope(value)) {
    throw new Error('Cannot decrypt: value is not a recognised secret envelope.');
  }
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(value.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(value.tag, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(value.ct, 'hex')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

/**
 * Encrypt every string value in a credentials map. Non-string values
 * (booleans, numbers — rare in our schemas but possible via metadata)
 * pass through untouched. Already-encrypted envelopes also pass
 * through, so calling this twice is a no-op.
 */
export function encryptCredentials(
  creds: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (typeof v === 'string' && v.length > 0) {
      out[k] = encryptSecret(v);
    } else if (isEnvelope(v)) {
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Mirror of `encryptCredentials` for reads. Plaintext (legacy rows)
 * passes through unchanged — required so the cutover is non-destructive.
 */
export function decryptCredentials(
  creds: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(creds)) {
    if (isEnvelope(v)) {
      out[k] = decryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
