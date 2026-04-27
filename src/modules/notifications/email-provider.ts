/**
 * Pluggable email provider (Principle #6 — Pluggable Providers).
 *
 * The notifications module talks to this interface only. Swapping Resend
 * for Postmark or SES later means writing a new implementation, not
 * touching every send site.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
