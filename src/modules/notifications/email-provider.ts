/**
 * Pluggable email provider (Principle #6 — Pluggable Providers).
 *
 * The notifications module talks to this interface only. Swapping Resend
 * for Postmark or SES later means writing a new implementation, not
 * touching every send site.
 */
export interface EmailAttachment {
  filename: string;
  /** Raw file content. Providers base64-encode as needed. */
  content: Buffer | string;
  /** e.g. 'text/calendar; method=REQUEST' for an .ics invite. */
  contentType?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  attachments?: EmailAttachment[];
  /** Extra SMTP headers, merged over the provider's transactional defaults. */
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
