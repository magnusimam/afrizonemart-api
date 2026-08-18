import { logger } from '@/infra/logger';
import type { EmailMessage, EmailProvider, EmailSendResult } from './email-provider';

/**
 * Local-dev email provider. Prints the message to the terminal instead of
 * actually delivering it — keeps engineers from spamming themselves and
 * sidesteps the need for an API key during development.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    logger.info('email.console.send', {
      to: message.to,
      subject: message.subject,
      tags: message.tags,
      attachments: message.attachments?.map((a) => a.filename),
    });
    // Attachments are printed in full: a calendar invite that fails to parse in
    // a mail client is otherwise invisible until someone reports a missing
    // meeting, and the .ics body is the only way to see why in dev.
    const attached = message.attachments?.length
      ? message.attachments
          .map((a) => `\n─── ATTACHMENT: ${a.filename} (${a.contentType ?? 'unknown'}) ───\n${a.content.toString()}`)
          .join('')
      : '';
    // eslint-disable-next-line no-console
    console.log(
      `\n────────── EMAIL (console) ──────────\nTo: ${message.to}\nSubject: ${message.subject}\n─── HTML ───\n${message.html}${attached}\n─────────────────────────────────────\n`,
    );
    return { providerMessageId: `console_${Date.now()}` };
  }
}
