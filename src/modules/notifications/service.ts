import * as React from 'react';
import { NotificationStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { emailProvider } from './provider-factory';
import { renderEmail } from './render';
import { resolveDbTemplate } from './template-resolver';

/**
 * One entry-point used by every event subscriber. Renders the React Email
 * template, hands it to the active provider, and writes a Notification
 * row regardless of outcome — so the admin log always reflects reality.
 *
 * Failure here NEVER throws back up to the caller. A flaky email provider
 * must not block an order from being placed or marked paid.
 */
export interface SendEmailInput {
  type: string;
  to: string;
  subject: string;
  template: React.ReactElement;
  userId?: string | null;
  context?: Prisma.InputJsonValue;
  replyTo?: string;
  /**
   * Phase 10.3 — variables that get substituted into admin-edited DB
   * templates. When omitted the dispatcher falls through to the
   * hardcoded `template` React element.
   */
  variables?: Record<string, unknown>;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { type, to, userId, context, replyTo, variables } = input;
  let { subject, template } = input;

  // Try the admin-edited DB template first; fall back to the hardcoded
  // React element if no row exists or the row is inactive.
  if (variables) {
    const fromDb = await resolveDbTemplate(type, variables);
    if (fromDb) {
      subject = fromDb.subject;
      template = fromDb.element;
      logger.info('email.template.source', { type, source: 'db' });
    }
  }

  let html = '';
  let text: string | undefined;
  try {
    const rendered = await renderEmail(template);
    html = rendered.html;
    text = rendered.text;
  } catch (error) {
    logger.error('email.render_failed', {
      type,
      to,
      error: error instanceof Error ? error.message : String(error),
    });
    await prisma.notification.create({
      data: {
        userId: userId ?? null,
        type,
        recipient: to,
        subject,
        status: NotificationStatus.FAILED,
        error: error instanceof Error ? error.message : String(error),
        context: context ?? {},
      },
    });
    return;
  }

  try {
    const result = await emailProvider.send({
      to,
      subject,
      html,
      text,
      replyTo,
      // Resend rejects anything outside [A-Za-z0-9_-]; our types use dots
      // (e.g. "user.welcome"), so swap them to underscores for the tag.
      tags: [{ name: 'type', value: type.replace(/[^A-Za-z0-9_-]/g, '_') }],
    });
    await prisma.notification.create({
      data: {
        userId: userId ?? null,
        type,
        recipient: to,
        subject,
        providerMessageId: result.providerMessageId,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        context: context ?? {},
      },
    });
    logger.info('email.sent', { type, to, provider: emailProvider.name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('email.send_failed', { type, to, error: message });
    await prisma.notification.create({
      data: {
        userId: userId ?? null,
        type,
        recipient: to,
        subject,
        status: NotificationStatus.FAILED,
        error: message,
        context: context ?? {},
      },
    });
  }
}

/**
 * Re-render and resend an existing Notification row (admin "resend" button).
 * The original context Json is the source of truth — we pass it back to
 * the template so the email looks identical to the original send.
 */
export async function resendNotification(
  notificationId: string,
  templateBuilder: (context: Prisma.JsonValue) => React.ReactElement,
): Promise<void> {
  const existing = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!existing) throw new Error('Notification not found');

  await sendEmail({
    type: existing.type,
    to: existing.recipient,
    subject: existing.subject ?? `(resend) ${existing.type}`,
    template: templateBuilder(existing.context),
    userId: existing.userId,
    context: existing.context as Prisma.InputJsonValue,
  });
}
