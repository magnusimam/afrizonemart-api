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
    });
    // eslint-disable-next-line no-console
    console.log(
      `\n────────── EMAIL (console) ──────────\nTo: ${message.to}\nSubject: ${message.subject}\n─── HTML ───\n${message.html}\n─────────────────────────────────────\n`,
    );
    return { providerMessageId: `console_${Date.now()}` };
  }
}
