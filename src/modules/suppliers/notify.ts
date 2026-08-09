import * as React from 'react';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { sendEmail } from '@/modules/notifications/service';
import {
  AuditCompleteEmail,
  ListingPublishedEmail,
  PIQApprovedEmail,
  PIQChangesEmail,
  PIQSubmittedEmail,
  POIssuedEmail,
  ReviewCallScheduledEmail,
  VisitConfirmedEmail,
} from '@/modules/notifications/templates/SupplierNotifications';

/**
 * Supplier transactional emails. Thin wrappers over `sendEmail` (which never
 * throws and always logs a Notification row). Each builds the portal deep-link
 * from WEB_URL. Callers may `await` these but a failure won't break the action.
 */

const dashboardUrl = () => `${env.WEB_URL}/supplier/dashboard`;
const piqEditUrl = (piqId: string) => `${env.WEB_URL}/supplier/piqs/${piqId}/edit`;

export async function notifyPIQSubmitted(p: {
  to: string;
  userId: string;
  recipientName: string;
  productName: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.piq.submitted',
    to: p.to,
    userId: p.userId,
    subject: `We’ve received your PIQ for ${p.productName}`,
    template: React.createElement(PIQSubmittedEmail, {
      recipientName: p.recipientName,
      productName: p.productName,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.piq_submitted', { to: p.to });
}

export async function notifyPIQApproved(p: {
  to: string;
  userId: string;
  recipientName: string;
  productName: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.piq.approved',
    to: p.to,
    userId: p.userId,
    subject: `${p.productName} has been approved`,
    template: React.createElement(PIQApprovedEmail, {
      recipientName: p.recipientName,
      productName: p.productName,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.piq_approved', { to: p.to });
}

export async function notifyPIQChanges(p: {
  to: string;
  userId: string;
  recipientName: string;
  productName: string;
  summary: string;
  piqId: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.piq.changes',
    to: p.to,
    userId: p.userId,
    subject: `A few changes needed on ${p.productName}`,
    template: React.createElement(PIQChangesEmail, {
      recipientName: p.recipientName,
      productName: p.productName,
      summary: p.summary,
      editUrl: piqEditUrl(p.piqId),
    }),
  });
  logger.info('supplier.email.piq_changes', { to: p.to });
}

export async function notifyAuditComplete(p: {
  to: string;
  userId: string;
  recipientName: string;
  outcome: 'APPROVED' | 'PROVISIONAL' | 'REJECTED';
  indicativeScore: number;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.audit.complete',
    to: p.to,
    userId: p.userId,
    subject: 'Your Afrizonemart product audit report is ready',
    template: React.createElement(AuditCompleteEmail, {
      recipientName: p.recipientName,
      outcome: p.outcome,
      indicativeScore: p.indicativeScore,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.audit_complete', { to: p.to });
}

export async function notifyListingPublished(p: {
  to: string;
  userId: string;
  recipientName: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.listing.published',
    to: p.to,
    userId: p.userId,
    subject: 'Your product is live on Afrizonemart',
    template: React.createElement(ListingPublishedEmail, {
      recipientName: p.recipientName,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.listing_published', { to: p.to });
}

export async function notifyPOIssued(p: {
  to: string;
  userId: string;
  recipientName: string;
  poNumber: string;
  currency: string;
  totalAmount: number;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.po.issued',
    to: p.to,
    userId: p.userId,
    subject: `New purchase order ${p.poNumber} from Afrizonemart`,
    template: React.createElement(POIssuedEmail, {
      recipientName: p.recipientName,
      poNumber: p.poNumber,
      currency: p.currency,
      totalAmount: p.totalAmount,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.po_issued', { to: p.to });
}

export async function notifyReviewCallScheduled(p: {
  to: string;
  userId: string;
  recipientName: string;
  scheduledAt: Date;
  meetingMode: string | null;
  meetingLink: string | null;
}): Promise<void> {
  const dateLabel = p.scheduledAt.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos', timeZoneName: 'short',
  });
  await sendEmail({
    type: 'supplier.reviewcall.scheduled',
    to: p.to,
    userId: p.userId,
    subject: 'Your Afrizonemart PIQ review call is scheduled',
    template: React.createElement(ReviewCallScheduledEmail, {
      recipientName: p.recipientName,
      dateLabel,
      meetingMode: p.meetingMode,
      meetingLink: p.meetingLink,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.reviewcall_scheduled', { to: p.to });
}

export async function notifyVisitConfirmed(p: {
  to: string;
  userId: string;
  recipientName: string;
  dateLabel: string;
  window: string | null;
  address: string | null;
  leadName: string | null;
  leadPhone: string | null;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.visit.confirmed',
    to: p.to,
    userId: p.userId,
    subject: 'Your Afrizonemart facility visit is confirmed',
    template: React.createElement(VisitConfirmedEmail, {
      recipientName: p.recipientName,
      dateLabel: p.dateLabel,
      window: p.window,
      address: p.address,
      leadName: p.leadName,
      leadPhone: p.leadPhone,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.visit_confirmed', { to: p.to });
}
