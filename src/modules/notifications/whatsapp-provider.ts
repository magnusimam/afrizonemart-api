import { env } from '@/config/env';
import { logger } from '@/infra/logger';

/**
 * WhatsApp send pipeline — admin order alerts, ConsoleWhatsApp
 * fallback for local dev.
 *
 * Why an interface + factory: same pattern as the email side
 * (Resend ↔ Console). When Magnus completes Meta Business
 * verification + template approval, set the four `WHATSAPP_*` env
 * vars in Railway and the MetaCloud provider takes over with no
 * code change.
 *
 * **Channel scope today: admin notifications ONLY.** Sending
 * customer-facing WhatsApp messages requires opt-in consent and a
 * separate template / phone-number identity strategy — out of
 * scope for this PR.
 */

export interface WhatsAppMessage {
  /// Recipient in E.164 format (e.g. "+2348012345678").
  to: string;
  /// Name of the approved template on Meta Business Manager.
  templateName: string;
  /// BCP-47 language code matching the template's variant (e.g.
  /// "en", "en_US"). Most accounts use plain "en".
  language: string;
  /// Positional parameters to feed the template's `{{1}}`, `{{2}}`,
  /// etc. variables. Order matters and must match the template.
  parameters: string[];
}

export interface WhatsAppProvider {
  name: string;
  /// Returns the gateway's message id on success. Throws on hard
  /// errors (4xx, 5xx). Caller is responsible for swallowing the
  /// rejection if a WhatsApp send failure shouldn't block the
  /// triggering event (today: order.paid).
  send(msg: WhatsAppMessage): Promise<{ id: string }>;
}

/**
 * Dev / no-cost provider — logs the rendered message to stdout and
 * returns a synthetic id. Selected when any of the four
 * `WHATSAPP_*` env vars are unset.
 */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'console';
  async send(msg: WhatsAppMessage): Promise<{ id: string }> {
    logger.info('whatsapp.console_send', {
      to: msg.to,
      template: msg.templateName,
      language: msg.language,
      params: msg.parameters,
    });
    return { id: `console-${Date.now()}` };
  }
}

/**
 * Meta WhatsApp Cloud API — production provider. Calls
 * https://graph.facebook.com/v22.0/<phoneNumberId>/messages with a
 * `template` payload. Requires:
 *   • WHATSAPP_PHONE_NUMBER_ID — sender phone id from Meta dashboard
 *   • WHATSAPP_ACCESS_TOKEN — system-user long-lived token
 *
 * Templates must be pre-approved on Meta Business Manager. For our
 * `new_order_alert` template the four positional parameters are:
 *   {{1}} orderNumber  e.g. "AZ-001234"
 *   {{2}} total        e.g. "₦12,500"
 *   {{3}} customerName e.g. "Joy O."
 *   {{4}} adminUrl     e.g. "https://afrizonemart.com/admin/orders/<id>"
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta-cloud';
  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  async send(msg: WhatsAppMessage): Promise<{ id: string }> {
    const url = `https://graph.facebook.com/v22.0/${this.phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to: msg.to.startsWith('+') ? msg.to.slice(1) : msg.to,
      type: 'template',
      template: {
        name: msg.templateName,
        language: { code: msg.language },
        components: [
          {
            type: 'body',
            parameters: msg.parameters.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw new Error(`Meta WhatsApp send failed: ${res.status} ${detail}`);
    }
    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
    };
    const id = json.messages?.[0]?.id ?? `meta-${Date.now()}`;
    return { id };
  }
}

/**
 * Singleton — chosen on first access based on which env vars are
 * set. The provider doesn't change at runtime, so caching is fine.
 */
let provider: WhatsAppProvider | null = null;

export function whatsappProvider(): WhatsAppProvider {
  if (provider) return provider;
  if (
    env.WHATSAPP_PHONE_NUMBER_ID &&
    env.WHATSAPP_ACCESS_TOKEN &&
    env.WHATSAPP_TEMPLATE_NAME
  ) {
    provider = new MetaCloudWhatsAppProvider(
      env.WHATSAPP_PHONE_NUMBER_ID,
      env.WHATSAPP_ACCESS_TOKEN,
    );
    logger.info('whatsapp.provider_selected', { provider: 'meta-cloud' });
  } else {
    provider = new ConsoleWhatsAppProvider();
    logger.info('whatsapp.provider_selected', {
      provider: 'console',
      reason:
        'WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN / WHATSAPP_TEMPLATE_NAME not all set',
    });
  }
  return provider;
}

/// Parse the comma-separated `ORDER_NOTIFY_WHATSAPP_TO` env into a
/// normalised E.164 array. Empty / unset → empty array, dispatcher
/// no-ops cleanly.
export function adminRecipients(): string[] {
  const raw = env.ORDER_NOTIFY_WHATSAPP_TO ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
