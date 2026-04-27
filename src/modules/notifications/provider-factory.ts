import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { ConsoleEmailProvider } from './console-provider';
import { ResendEmailProvider } from './resend-provider';
import type { EmailProvider } from './email-provider';

/**
 * Singleton factory — picks Resend when keys are present, otherwise
 * Console. Resolved at first import so the rest of the module can just
 * `import { emailProvider }`.
 */
function build(): EmailProvider {
  if (env.RESEND_API_KEY) {
    logger.info('email.provider.selected', { provider: 'resend' });
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  logger.info('email.provider.selected', { provider: 'console' });
  return new ConsoleEmailProvider();
}

export const emailProvider: EmailProvider = build();
