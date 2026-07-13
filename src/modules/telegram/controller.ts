import type { Request, Response } from 'express';
import { logger } from '@/infra/logger';
import {
  adminChatIds,
  callBotApi,
} from '@/modules/notifications/telegram-provider';
import {
  CALLBACK_COMMANDS,
  parseCommand,
  runCommand,
  type BotReply,
} from './commands';

/**
 * Inbound Telegram webhook — the interactive half of the order bot.
 * Telegram POSTs every update (messages + button taps) here; we
 * authorise, run the requested read-only command, and reply.
 *
 * Security: the route-level middleware has already checked the
 * secret-token header before we run. On top of that, command replies
 * only go to chat ids in `ORDER_NOTIFY_TELEGRAM_CHAT_ID` — a stranger
 * who finds the bot gets a polite "not authorised", never store data.
 */

/// Minimal shape of the slice of the Telegram Update we consume.
interface TgUpdate {
  message?: {
    text?: string;
    chat?: { id: number | string };
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: { id: number | string };
    message?: {
      message_id: number;
      chat?: { id: number | string };
    };
  };
}

function isAuthorized(chatId: string): boolean {
  return adminChatIds().includes(chatId);
}

async function sendReply(chatId: string, reply: BotReply): Promise<void> {
  await callBotApi('sendMessage', {
    chat_id: chatId,
    text: reply.text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: reply.replyMarkup,
  });
}

export async function telegramWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  /// Ack immediately so Telegram doesn't retry while we do DB work.
  /// Any error after this point is logged, never surfaced (a non-2xx
  /// just makes Telegram redeliver the same update in a loop).
  res.status(200).json({ ok: true });

  const update = req.body as TgUpdate;
  try {
    await handleUpdate(update);
  } catch (err) {
    logger.error('telegram.webhook_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleUpdate(update: TgUpdate): Promise<void> {
  // --- text command ("/today", "/start", …) ---
  if (update.message?.text && update.message.chat) {
    const chatId = String(update.message.chat.id);
    const cmd = parseCommand(update.message.text);
    if (!cmd) return; // plain chatter — ignore
    if (!isAuthorized(chatId)) {
      /// Go completely silent — don't confirm the bot exists or that
      /// the command was understood. Logging lets us see probe attempts.
      logger.warn('telegram.unauthorized', { chatId, cmd });
      return;
    }
    logger.info('telegram.command', { chatId, cmd });
    await sendReply(chatId, await runCommand(cmd));
    return;
  }

  // --- inline button tap (callback_query) ---
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id ?? cq.from?.id ?? '');
    /// Always answer the callback so the button's spinner stops, even
    /// if we bail below. Swallow errors — a stale query id is harmless.
    await callBotApi('answerCallbackQuery', { callback_query_id: cq.id }).catch(
      () => {},
    );
    if (!chatId) return;
    if (!isAuthorized(chatId)) {
      logger.warn('telegram.unauthorized_callback', { chatId, data: cq.data });
      return;
    }
    const cmd = cq.data ? CALLBACK_COMMANDS[cq.data] : undefined;
    if (!cmd) return;
    logger.info('telegram.callback', { chatId, cmd });
    const reply = await runCommand(cmd);

    /// Edit the existing panel in place for a clean single-message
    /// feel; if the edit fails (message too old, identical content),
    /// fall back to a fresh message so the tap is never a no-op.
    if (cq.message?.message_id) {
      try {
        await callBotApi('editMessageText', {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: reply.text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: reply.replyMarkup,
        });
        return;
      } catch {
        /* fall through to sendMessage */
      }
    }
    await sendReply(chatId, reply);
  }
}
