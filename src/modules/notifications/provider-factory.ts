import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { ConsoleEmailProvider } from './console-provider';
import { ResendEmailProvider } from './resend-provider';
import type { EmailMessage, EmailProvider, EmailSendResult } from './email-provider';

/**
 * Singleton factory — picks Resend when keys are present, otherwise
 * Console. Resolved at first import so the rest of the module can just
 * `import { emailProvider }`.
 */

/**
 * Non-production safety net.
 *
 * The dev database holds 83 real supplier email addresses, and Resend is
 * selected purely on `RESEND_API_KEY` being present — so without this,
 * approving a PIQ on a laptop emails a real business. This wrapper delivers
 * through Resend only to allowlisted recipients and routes everything else to
 * the console provider.
 *
 * Routing to console (rather than silently dropping) keeps the existing dev
 * behaviour and stays honest in the audit trail: the Notification row is still
 * written, and `providerMessageId` shows which provider actually handled it
 * (`console_*` vs a Resend id).
 *
 * Disabled entirely when NODE_ENV=production.
 */
class AllowlistedEmailProvider implements EmailProvider {
  readonly name: string;
  private allow: string[];

  constructor(private real: EmailProvider, private fallback: EmailProvider, allowlist: string) {
    this.name = `${real.name}+allowlist`;
    this.allow = allowlist
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private permitted(to: string): boolean {
    const addr = to.trim().toLowerCase();
    return this.allow.some((rule) =>
      rule.startsWith('*@') ? addr.endsWith(rule.slice(1)) : rule === addr,
    );
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (this.permitted(message.to)) return this.real.send(message);

    logger.warn('email.blocked_by_allowlist', {
      to: message.to,
      subject: message.subject,
      hint: 'Not in EMAIL_DEV_ALLOWLIST — routed to console instead of Resend.',
    });
    return this.fallback.send(message);
  }
}

function build(): EmailProvider {
  if (!env.RESEND_API_KEY) {
    logger.info('email.provider.selected', { provider: 'console' });
    return new ConsoleEmailProvider();
  }

  const resend = new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);

  if (env.NODE_ENV === 'production') {
    logger.info('email.provider.selected', { provider: 'resend' });
    return resend;
  }

  // Non-production with a live key: guard it. An empty allowlist means nothing
  // is delivered — fail closed, because an accidental send to a supplier
  // cannot be taken back.
  logger.warn('email.provider.selected', {
    provider: 'resend+allowlist',
    allowlist: env.EMAIL_DEV_ALLOWLIST || '(empty — everything routes to console)',
    note: 'NODE_ENV is not production, so only allowlisted recipients receive real email.',
  });
  return new AllowlistedEmailProvider(resend, new ConsoleEmailProvider(), env.EMAIL_DEV_ALLOWLIST);
}

export const emailProvider: EmailProvider = build();
