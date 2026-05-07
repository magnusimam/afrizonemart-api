import { logger } from '@/infra/logger';
import type { PaymentGateway } from './gateway';
import { FlutterwaveGateway } from './flutterwave-gateway';
import { GtSquadGateway } from './gtsquad-gateway';
import { StubGateway } from './stub-gateway';

/**
 * Phase 10.2 — Payment provider registry.
 *
 * Maps a stable provider key (the value stored in
 * `PaymentGatewayConfig.provider`) to a factory that turns the row's
 * credentials JSON into a live `PaymentGateway` instance.
 *
 * Adding a new provider type (Paystack, Flutterwave, M-Pesa, Stripe…)
 * is two steps:
 *   1. Drop a `<provider>-gateway.ts` file in this folder that
 *      implements `PaymentGateway`.
 *   2. Append it to `PROVIDER_FACTORIES` below with a brief
 *      `requiredCredentials` list so the admin form knows what to ask
 *      for.
 * The rest of the system (admin UI, checkout picker, webhook routing)
 * picks it up automatically.
 */

export type ProviderKey = string;

export interface ProviderField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required: boolean;
  helpText?: string;
  /** For SELECT-type fields. */
  options?: string[];
}

export interface ProviderDefinition {
  /** Stable code key — never change once shipped. */
  key: ProviderKey;
  /** Human-readable provider name shown in admin. */
  displayName: string;
  /** What the customer sees by default at checkout. Editable per-config. */
  defaultLabel: string;
  /** Currencies the provider can process. */
  supportedCurrencies: string[];
  /** Form schema the admin form auto-renders. */
  credentialFields: ProviderField[];
  /** Whether the provider has a sandbox / live split. */
  hasEnvironments: boolean;
  /** Build a runtime instance from a config row's credentials JSON. */
  build: (cfg: {
    environment: string;
    credentials: Record<string, unknown>;
  }) => PaymentGateway;
}

export const PROVIDER_FACTORIES: Record<ProviderKey, ProviderDefinition> = {
  squad: {
    key: 'squad',
    displayName: 'GT Squad',
    defaultLabel: 'Card / Squad',
    supportedCurrencies: ['NGN', 'USD'],
    hasEnvironments: true,
    credentialFields: [
      {
        key: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText: 'sandbox_sk_… for sandbox, sk_… for live.',
      },
    ],
    build: ({ environment, credentials }) => {
      const secret = String(credentials.secretKey ?? '');
      if (!secret) throw new Error('Squad: secretKey is required.');
      const env = environment === 'live' ? 'live' : 'sandbox';
      return new GtSquadGateway(secret, env);
    },
  },
  flutterwave: {
    key: 'flutterwave',
    displayName: 'Flutterwave',
    defaultLabel: 'Card / Flutterwave',
    /// Flutterwave's pan-African coverage — admin can pick any subset.
    supportedCurrencies: [
      'NGN', 'USD', 'EUR', 'GBP',
      'GHS', 'KES', 'UGX', 'TZS', 'ZAR', 'RWF', 'ZMW',
      'XAF', 'XOF',
    ],
    /// Same base URL for sandbox + live; the key prefix
    /// (FLWSECK_TEST- vs FLWSECK-) determines the environment, so the
    /// admin form skips the env selector.
    hasEnvironments: false,
    credentialFields: [
      {
        key: 'secretKey',
        label: 'Secret key',
        type: 'password',
        required: true,
        helpText: 'FLWSECK_TEST-… for test, FLWSECK-… for live.',
      },
      {
        key: 'secretHash',
        label: 'Webhook secret hash',
        type: 'password',
        required: true,
        helpText:
          'The "Secret Hash" set on your Flutterwave dashboard under Settings → Webhooks. Must match exactly — Flutterwave sends it in the verif-hash header.',
      },
    ],
    build: ({ credentials }) => {
      const secret = String(credentials.secretKey ?? '');
      const hash = String(credentials.secretHash ?? '');
      if (!secret) throw new Error('Flutterwave: secretKey is required.');
      if (!hash) throw new Error('Flutterwave: secretHash is required.');
      return new FlutterwaveGateway(secret, hash);
    },
  },
  stub: {
    key: 'stub',
    displayName: 'Stub (development only)',
    defaultLabel: 'Test payment',
    supportedCurrencies: ['NGN', 'USD', 'GBP'],
    hasEnvironments: false,
    credentialFields: [],
    build: () => new StubGateway(),
  },
};

export function listProviderDefinitions(): ProviderDefinition[] {
  return Object.values(PROVIDER_FACTORIES);
}

export function getProviderDefinition(key: ProviderKey): ProviderDefinition | null {
  return PROVIDER_FACTORIES[key] ?? null;
}

/**
 * Builds a runtime gateway from a stored config. Throws on unknown
 * provider key or invalid credentials.
 */
export function buildGateway(cfg: {
  provider: string;
  environment: string;
  credentials: Record<string, unknown>;
}): PaymentGateway {
  const def = PROVIDER_FACTORIES[cfg.provider];
  if (!def) {
    throw new Error(
      `Unknown payment provider "${cfg.provider}". Known: ${Object.keys(PROVIDER_FACTORIES).join(', ')}`,
    );
  }
  return def.build({ environment: cfg.environment, credentials: cfg.credentials });
}

logger.info('payments.registry.loaded', {
  providers: Object.keys(PROVIDER_FACTORIES),
});
