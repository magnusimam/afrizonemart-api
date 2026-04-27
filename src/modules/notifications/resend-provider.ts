import { Resend } from 'resend';
import { logger } from '@/infra/logger';
import type { EmailMessage, EmailProvider, EmailSendResult } from './email-provider';

/**
 * Resend (resend.com) implementation of EmailProvider.
 *
 * Selected automatically by the factory when `RESEND_API_KEY` is set.
 * Throws on send failure so the dispatcher can record a FAILED row and
 * surface it in the admin notifications log.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  private client: Resend;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
      tags: message.tags,
    });

    if (error) {
      logger.error('email.resend.failed', {
        to: message.to,
        subject: message.subject,
        error: error.message,
      });
      throw new Error(`Resend send failed: ${error.message}`);
    }

    return { providerMessageId: data?.id ?? null };
  }
}
