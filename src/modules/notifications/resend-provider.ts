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
      /**
       * Headers that mark this as one-to-one transactional mail rather than a
       * campaign — the difference between Gmail's Primary tab and Promotions.
       *
       * `Auto-Submitted: auto-generated` (RFC 3834) states plainly that this
       * was generated in response to something the recipient did.
       *
       * `X-Entity-Ref-ID` gives each message a distinct identity so Gmail
       * doesn't roll similar messages into one promotional thread.
       *
       * Deliberately NOT set: `List-Unsubscribe` and `Precedence: bulk`. Both
       * are correct for campaigns and actively harmful here — they tell Gmail
       * this is bulk mail, which is the classification we are trying to avoid.
       * A purchase order or a password-change notice is not something a
       * supplier can opt out of.
       */
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...message.headers,
      },
      // Resend takes `content` as a Buffer or base64 string; our EmailAttachment
      // allows either, so pass it straight through.
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
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
