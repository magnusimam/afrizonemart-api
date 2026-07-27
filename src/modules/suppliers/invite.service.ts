import * as React from 'react';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/infra/prisma';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { sendEmail } from '@/modules/notifications/service';
import { SupplierInviteEmail } from '@/modules/notifications/templates/SupplierInvite';

/**
 * Supplier invite — issues a single-use "set your password" token (reuses the
 * password-reset token model) and emails a branded link. Used to onboard the
 * bulk-imported suppliers onto the dashboard. Sends via the active email
 * provider (Console in dev, Resend in prod); never throws to the batch caller.
 */
const INVITE_EXPIRY_DAYS = 14;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function sendSupplierInvite(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { supplierProfile: true },
  });
  if (!user || !user.supplierProfile) {
    throw HttpError.notFound('Not a supplier');
  }

  // Clear spent / expired tokens, then mint a fresh one.
  await prisma.passwordResetToken.deleteMany({
    where: {
      userId,
      OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });
  const token = randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const setPasswordUrl = `${env.WEB_URL}/supplier/set-password?token=${token}`;
  const loginUrl = `${env.WEB_URL}/supplier/login`;

  await sendEmail({
    type: 'supplier.invite',
    to: user.email,
    subject: 'Set up your Afrizonemart supplier account',
    template: React.createElement(SupplierInviteEmail, {
      recipientName: user.name ?? user.supplierProfile.contactName,
      companyName: user.supplierProfile.companyName,
      setPasswordUrl,
      loginUrl,
    }),
    userId,
  });

  return user.email;
}
