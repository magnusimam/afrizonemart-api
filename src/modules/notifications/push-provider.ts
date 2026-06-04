import { logger } from '@/infra/logger';
import { deletePushToken } from '@/modules/push/repository';

/**
 * Push send pipeline — transactional only (order lifecycle).
 *
 * Same Provider-pattern as email + WhatsApp: an interface, an
 * `ExpoPushProvider` (production), a `ConsolePushProvider` (dev).
 * Selected at startup based on `EXPO_PUSH_DISABLED` env (defaults
 * to enabled).
 *
 * Expo Push is FREE and doesn't require FCM/APNs keys in the app
 * config — the Expo push service relays to FCM/APNs using project-
 * level credentials EAS Build sets up. So this provider is fully
 * functional as soon as the mobile app calls `Notifications.
 * getExpoPushTokenAsync()` and posts the resulting token to
 * `/api/push/tokens`.
 */

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /// Arbitrary data the mobile app reads in the notification tap
  /// handler. Today: `{ deepLink: 'afrizonemart://order/<id>' }`
  /// for order events; the mobile router resolves to the
  /// OrderDetail screen.
  data?: Record<string, unknown>;
  /// iOS only — overrides the default sound. Defaults to 'default'.
  sound?: 'default' | null;
  /// Android channel id. Defaults to 'default'. Channels are
  /// configured client-side; the api just passes whatever the
  /// dispatcher sets.
  channelId?: string;
  /// iOS only — bumps the app icon badge. Order events don't use
  /// this today.
  badge?: number;
}

export interface PushProvider {
  name: string;
  /// Sends to ONE token. Failures are caught and logged inside the
  /// provider — the caller can fan out across many tokens without
  /// a single bad token aborting the batch.
  send(msg: PushMessage): Promise<{ ok: boolean }>;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Dev provider — logs to stdout, returns ok. Selected when
 * EXPO_PUSH_DISABLED=1.
 */
export class ConsolePushProvider implements PushProvider {
  readonly name = 'console';
  async send(msg: PushMessage): Promise<{ ok: boolean }> {
    logger.info('push.console_send', {
      to: redactToken(msg.to),
      title: msg.title,
      body: msg.body,
      data: msg.data,
    });
    return { ok: true };
  }
}

/**
 * Production provider — POSTs to the Expo push service. Single-
 * token send so the caller can `Promise.all` across tokens with
 * cheap per-token error handling. Treats `DeviceNotRegistered`
 * receipts as a signal to drop the token from our DB.
 *
 * For higher throughput we'd switch to the batch endpoint (Expo
 * accepts up to 100 per request), but admin volume + order events
 * stay below the threshold today.
 */
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  async send(msg: PushMessage): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          to: msg.to,
          title: msg.title,
          body: msg.body,
          data: msg.data ?? {},
          sound: msg.sound === null ? null : 'default',
          channelId: msg.channelId ?? 'default',
          badge: msg.badge,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        logger.warn('push.send_http_error', {
          to: redactToken(msg.to),
          status: res.status,
          detail: detail.slice(0, 240),
        });
        return { ok: false };
      }
      /// Expo returns a per-ticket result envelope: `{ data: { status,
      /// id, message?, details? } }`. Inspect for the known "drop
      /// this token" signal.
      const json = (await res.json()) as {
        data?: {
          status?: string;
          message?: string;
          details?: { error?: string };
        };
      };
      const status = json.data?.status;
      if (status === 'ok') return { ok: true };
      const errorCode = json.data?.details?.error ?? '';
      if (
        errorCode === 'DeviceNotRegistered' ||
        json.data?.message?.includes('not a registered push notification recipient')
      ) {
        /// Drop the token from our DB so we don't keep firing.
        /// Fire-and-forget — token may have been deleted already by a
        /// concurrent logout.
        void deletePushToken(msg.to);
        logger.info('push.token_dropped', { to: redactToken(msg.to) });
        return { ok: false };
      }
      logger.warn('push.send_rejected', {
        to: redactToken(msg.to),
        status,
        message: json.data?.message,
        error: errorCode,
      });
      return { ok: false };
    } catch (err) {
      logger.error('push.send_unexpected', {
        to: redactToken(msg.to),
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false };
    }
  }
}

let provider: PushProvider | null = null;

export function pushProvider(): PushProvider {
  if (provider) return provider;
  if (process.env.EXPO_PUSH_DISABLED === '1') {
    provider = new ConsolePushProvider();
    logger.info('push.provider_selected', {
      provider: 'console',
      reason: 'EXPO_PUSH_DISABLED=1',
    });
  } else {
    provider = new ExpoPushProvider();
    logger.info('push.provider_selected', { provider: 'expo' });
  }
  return provider;
}

/// Redact most of an ExponentPushToken in logs — keep the last 6
/// chars so we can correlate with mobile-side logs without leaking
/// the full opaque token (it's not a secret but still PII-adjacent).
function redactToken(token: string): string {
  if (token.length <= 8) return '***';
  return `***${token.slice(-6)}`;
}
