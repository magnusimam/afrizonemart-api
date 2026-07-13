import { env } from '@/config/env';
import { logger } from '@/infra/logger';

/**
 * Telegram send pipeline — admin order alerts, ConsoleTelegram
 * fallback for local dev.
 *
 * Why Telegram (2026-07-13): WhatsApp Cloud API needs Meta Business
 * verification + template approval before it can send a single
 * message, and that's still pending (see [[whatsapp-admin-alerts]]).
 * Telegram has none of that friction — Magnus creates a bot with
 * @BotFather, drops the token + his chat id into Railway env, and
 * alerts start flowing. Zero cost, no approval queue.
 *
 * Same shape as the WhatsApp + email providers (interface + factory +
 * Console fallback) so the wiring reads the same across all three
 * admin-notification channels. When TELEGRAM_BOT_TOKEN is set the
 * real BotApiTelegramProvider is selected; otherwise the
 * ConsoleTelegramProvider logs to stdout and every dispatcher call
 * no-ops cleanly — dev environments don't need a bot token.
 *
 * **Channel scope: admin notifications ONLY.** These go to the
 * afrizonemart ops chat(s) — never to customers.
 */

export interface TelegramMessage {
  /// Target chat id. For a DM to Magnus this is his numeric user id
  /// (e.g. "123456789"); for a group it's the negative group id
  /// (e.g. "-1001234567890"). Obtained once via @userinfobot or the
  /// bot's getUpdates — see the [[telegram-order-alerts]] memory.
  chatId: string;
  /// Message body. Rendered with parse_mode=HTML, so callers may use
  /// a small subset of HTML (<b>, <i>, <a href>). Non-markup text
  /// MUST be escaped with escapeHtml() before interpolation.
  text: string;
}

export interface TelegramProvider {
  name: string;
  /// Returns the sent message id on success. Throws on hard errors
  /// (network, 4xx, 5xx). Caller swallows the rejection so an alert
  /// failure never blocks the triggering order event.
  send(msg: TelegramMessage): Promise<{ id: string }>;
}

/**
 * Dev / no-cost provider — logs the rendered message to stdout and
 * returns a synthetic id. Selected when TELEGRAM_BOT_TOKEN is unset.
 */
export class ConsoleTelegramProvider implements TelegramProvider {
  readonly name = 'console';
  async send(msg: TelegramMessage): Promise<{ id: string }> {
    logger.info('telegram.console_send', {
      chatId: msg.chatId,
      text: msg.text,
    });
    return { id: `console-${msg.chatId}` };
  }
}

/**
 * Telegram Bot API — production provider. Calls
 * https://api.telegram.org/bot<token>/sendMessage with a JSON body.
 * Requires:
 *   • TELEGRAM_BOT_TOKEN — the token @BotFather hands back when the
 *     bot is created (looks like "123456789:AA...").
 *
 * No template approval, no per-message cost. The only prerequisite
 * is that each recipient chat has messaged the bot at least once
 * (Telegram won't let a bot open a conversation), which for a DM
 * means Magnus taps "Start" on the bot once.
 */
export class BotApiTelegramProvider implements TelegramProvider {
  readonly name = 'bot-api';
  constructor(private readonly botToken: string) {}

  async send(msg: TelegramMessage): Promise<{ id: string }> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const body = {
      chat_id: msg.chatId,
      text: msg.text,
      parse_mode: 'HTML',
      /// Order links would otherwise expand into a bulky link card
      /// under every alert — suppress it, the text is the point.
      disable_web_page_preview: true,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
      throw new Error(`Telegram send failed: ${res.status} ${detail}`);
    }
    const json = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { message_id: number };
    };
    /// Telegram returns HTTP 200 with `ok:false` for logical errors
    /// (bad chat id, bot blocked). Treat that as a hard failure too
    /// so it lands in telegram.send_failed with the real reason.
    if (!json.ok) {
      throw new Error(`Telegram send rejected: ${json.description ?? 'ok:false'}`);
    }
    const id = json.result?.message_id?.toString() ?? `tg-unknown`;
    return { id };
  }
}

/**
 * Singleton — chosen on first access based on whether the bot token
 * is set. The provider doesn't change at runtime, so caching is fine.
 */
let provider: TelegramProvider | null = null;

export function telegramProvider(): TelegramProvider {
  if (provider) return provider;
  if (env.TELEGRAM_BOT_TOKEN) {
    provider = new BotApiTelegramProvider(env.TELEGRAM_BOT_TOKEN);
    logger.info('telegram.provider_selected', { provider: 'bot-api' });
  } else {
    provider = new ConsoleTelegramProvider();
    logger.info('telegram.provider_selected', {
      provider: 'console',
      reason: 'TELEGRAM_BOT_TOKEN not set',
    });
  }
  return provider;
}

/// Parse the comma-separated `ORDER_NOTIFY_TELEGRAM_CHAT_ID` env into
/// a trimmed array. Empty / unset → empty array, dispatcher no-ops.
export function adminChatIds(): string[] {
  const raw = env.ORDER_NOTIFY_TELEGRAM_CHAT_ID ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/// Minimal HTML escape for parse_mode=HTML. Telegram only cares
/// about these three; escaping them keeps customer names / reasons
/// with stray "&" or "<" from breaking the markup or 400-ing.
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
