import * as React from 'react';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { ORGANISER, icsAttachment, meetingUid } from '@/modules/notifications/calendar';
import { sendEmail } from '@/modules/notifications/service';
import {
  AuditCompleteEmail,
  AuditReportFiledEmail,
  ListingPublishedEmail,
  PIQApprovedEmail,
  PIQChangesEmail,
  PIQSubmittedEmail,
  POIssuedEmail,
  ReviewCallScheduledEmail,
  VisitConfirmedEmail,
} from '@/modules/notifications/templates/SupplierNotifications';
import {
  SupplierApplicationReceivedEmail,
  SupplierEOIReceivedEmail,
  SupplierPasswordChangedEmail,
  SupplierPOAcknowledgedEmail,
  SupplierPODueSoonEmail,
  SupplierPOUnacknowledgedEmail,
  SupplierProductionBookedEmail,
  SupplierTradeEngagementEmail,
  SupplierWelcomeEmail,
} from '@/modules/notifications/templates/SupplierLifecycle';

/**
 * Supplier transactional emails. Thin wrappers over `sendEmail` (which never
 * throws and always logs a Notification row). Each builds the portal deep-link
 * from WEB_URL. Callers may `await` these but a failure won't break the action.
 */

/**
 * Email links use EMAIL_LINK_BASE, not WEB_URL — an email outlives the machine
 * that sent it, and a localhost link in a supplier's inbox is dead on arrival.
 */
const LINK_BASE = env.EMAIL_LINK_BASE.replace(/\/$/, '');
const dashboardUrl = () => `${LINK_BASE}/supplier/dashboard`;
const piqEditUrl = (piqId: string) => `${LINK_BASE}/supplier/piqs/${piqId}/edit`;
const piqUrl = () => `${LINK_BASE}/supplier/piqs`;
const stageUrl = (stage: number) => `${LINK_BASE}/supplier/stages/${stage}`;

/**
 * Supplier mail replies reach the supplier team, not the shopper support
 * inbox — these are business relationships being onboarded, and
 * SUPPLIER_EMAIL_SEQUENCE.md §1 principle 6 requires a human on the other end.
 * Overridable per-environment; the constant is the fallback, not the policy.
 */
const REPLY_TO = env.EMAIL_REPLY_TO ?? 'suppliers@afrizonemart.com';

/**
 * Once-ever guard for lifecycle emails.
 *
 * `completeStage` deliberately allows re-completing an earlier stage — suppliers
 * legitimately go back and revise their EoI — so a naive hook would re-send the
 * "you're through Stage 2" email on every resubmit. SUPPLIER_EMAIL_SEQUENCE.md §4
 * specifies a `SupplierEmailLog` for this, but `Notification` already persists
 * (userId, type, status) for every send, which is the same idempotency spine
 * without a migration. Checking SENT (not FAILED) means a send that genuinely
 * failed can still be retried.
 *
 * Deliberately NOT applied to per-object emails (PIQ, PO): those are keyed to an
 * entity and must fire once per entity, not once per supplier.
 */
async function alreadySent(userId: string, type: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { userId, type, status: 'SENT' },
    select: { id: true },
  });
  return existing !== null;
}

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
  /** The signed diagnostic report. Optional: if the PDF renderer is
   *  unavailable the email still goes out, and the supplier reads the report
   *  in the portal instead. A missing attachment must never withhold a
   *  verdict the supplier is entitled to. */
  reportPdf?: { filename: string; content: Buffer; contentType?: string };
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
    attachments: p.reportPdf
      ? [
          {
            filename: p.reportPdf.filename,
            content: p.reportPdf.content,
            // Was hardcoded to application/pdf. The first cohort of reports
            // are .docx files, so that mislabelled every one of them: some
            // clients refuse to open an attachment whose type contradicts
            // its extension. Falls back to PDF for engine-rendered reports.
            contentType: p.reportPdf.contentType ?? 'application/pdf',
          },
        ]
      : undefined,
  });
  logger.info('supplier.email.audit_complete', { to: p.to, attached: Boolean(p.reportPdf) });
}

/**
 * The QA team's copy of a released report.
 *
 * Sent to every configured recipient independently rather than as one
 * multi-recipient message: a single send that fails takes the whole list with
 * it, and one bad address in the config should not cost the others their copy.
 */
export async function notifyAuditReportFiled(p: {
  recipients: string[];
  supplierName: string;
  supplierId: string;
  outcome: 'APPROVED' | 'PROVISIONAL' | 'REJECTED';
  indicativeScore: number;
  signedBy: string;
  documentCode: string;
  reportPdf?: { filename: string; content: Buffer; contentType?: string };
}): Promise<void> {
  if (p.recipients.length === 0) return;

  const template = () => React.createElement(AuditReportFiledEmail, {
    supplierName: p.supplierName,
    outcome: p.outcome,
    indicativeScore: p.indicativeScore,
    signedBy: p.signedBy,
    documentCode: p.documentCode,
    adminUrl: `${LINK_BASE}/admin/supplier-audits/${p.supplierId}/report`,
  });

  const attachments = p.reportPdf
    ? [
        {
          filename: p.reportPdf.filename,
          content: p.reportPdf.content,
          contentType: p.reportPdf.contentType ?? 'application/pdf',
        },
      ]
    : undefined;

  for (const to of p.recipients) {
    try {
      await sendEmail({
        type: 'admin.audit.report_filed',
        to,
        subject: `${p.supplierName} — ${p.outcome} (${p.indicativeScore}/100)`,
        template: template(),
        attachments,
      });
    } catch (error) {
      // The supplier has already been served; an admin copy failing must not
      // surface as a failed authorisation.
      logger.error('supplier.email.audit_filed_failed', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.info('supplier.email.audit_filed', { count: p.recipients.length });
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
  /** Needed for a stable calendar UID so a reschedule updates the same entry. */
  supplierId?: string;
}): Promise<void> {
  const dateLabel = p.scheduledAt.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos', timeZoneName: 'short',
  });
  await sendEmail({
    type: 'supplier.reviewcall.scheduled',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    subject: 'Your Afrizonemart PIQ review call is scheduled',
    template: React.createElement(ReviewCallScheduledEmail, {
      recipientName: p.recipientName,
      dateLabel,
      meetingMode: p.meetingMode,
      meetingLink: p.meetingLink,
      dashboardUrl: dashboardUrl(),
    }),
    // A real calendar entry rather than a date they have to copy across by
    // hand. Same UID on a reschedule, so the client updates the existing event.
    attachments: p.supplierId
      ? [icsAttachment({
          uid: meetingUid('reviewcall', p.supplierId),
          start: p.scheduledAt,
          durationMinutes: 45,
          title: 'Afrizonemart — PIQ review call',
          description: [
            'Your product questionnaire review call with the Afrizonemart sourcing team.',
            p.meetingLink ? `Join: ${p.meetingLink}` : null,
          ].filter(Boolean).join('\n'),
          location: p.meetingLink ?? p.meetingMode ?? undefined,
          organiserName: ORGANISER.name,
          organiserEmail: ORGANISER.email,
          attendeeName: p.recipientName,
          attendeeEmail: p.to,
          // Seconds-since-epoch is monotonic, so a later reschedule always
          // outranks the previous invite for the same UID.
          sequence: Math.floor(Date.now() / 1000),
        }, 'piq-review-call.ics')]
      : undefined,
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
  supplierId?: string;
  /** The actual instant, for the calendar entry. `dateLabel` is display-only. */
  confirmedDate?: Date;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.visit.confirmed',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
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
    attachments: p.supplierId && p.confirmedDate
      ? [icsAttachment({
          uid: meetingUid('facilityvisit', p.supplierId),
          start: p.confirmedDate,
          // A site visit runs most of a day; the confirmed window is prose
          // ("10:00 – 13:00") rather than a parseable range, so block 4h and
          // let the email body carry the exact window.
          durationMinutes: 240,
          title: 'Afrizonemart — facility visit',
          description: [
            'Afrizonemart facility visit and on-site assessment.',
            p.window ? `Window: ${p.window}` : null,
            p.leadName ? `Visit lead: ${p.leadName}${p.leadPhone ? ` (${p.leadPhone})` : ''}` : null,
          ].filter(Boolean).join('\n'),
          location: p.address ?? undefined,
          organiserName: ORGANISER.name,
          organiserEmail: ORGANISER.email,
          attendeeName: p.recipientName,
          attendeeEmail: p.to,
          sequence: Math.floor(Date.now() / 1000),
        }, 'facility-visit.ics')]
      : undefined,
  });
  logger.info('supplier.email.visit_confirmed', { to: p.to });
}

/* ------------------------------------------------------------------ *
 * Lifecycle emails — journey progression rather than per-object receipts.
 * ------------------------------------------------------------------ */

const STAGE_NAMES = [
  'Discovery',
  'Expression of Interest',
  'Registration & Profiling',
  'Product Questionnaire',
  'Orientation',
  'Product Audit',
  'Partnership',
  'Activation & Listing',
  'Trade Engagement',
  'Continuous Engagement',
];

const lagosDateLabel = (d: Date) =>
  d.toLocaleString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos', timeZoneName: 'short',
  });

/** Fires on first successful password set / first login. */
export async function notifySupplierWelcome(p: {
  to: string;
  userId: string;
  recipientName: string;
  currentStage: number;
}): Promise<void> {
  if (await alreadySent(p.userId, 'supplier.welcome')) return;
  await sendEmail({
    type: 'supplier.welcome',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    subject: 'Your Afrizonemart supplier account is ready',
    template: React.createElement(SupplierWelcomeEmail, {
      recipientName: p.recipientName,
      dashboardUrl: dashboardUrl(),
      currentStageName: STAGE_NAMES[p.currentStage - 1] ?? STAGE_NAMES[0],
    }),
  });
  logger.info('supplier.email.welcome', { to: p.to });
}

/** Fires when someone submits "Apply to supply". */
export async function notifyApplicationReceived(p: {
  to: string;
  userId: string;
  recipientName: string;
  companyName: string;
}): Promise<void> {
  if (await alreadySent(p.userId, 'supplier.application.received')) return;
  await sendEmail({
    type: 'supplier.application.received',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    subject: 'We’ve received your application to supply Afrizonemart',
    template: React.createElement(SupplierApplicationReceivedEmail, {
      recipientName: p.recipientName,
      companyName: p.companyName,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.application_received', { to: p.to });
}

/**
 * Security confirmation after a password change. No replyTo override — a
 * "was this you?" message should reach whoever handles account security.
 */
export async function notifySupplierPasswordChanged(p: {
  to: string;
  userId: string;
  recipientName: string;
  changedAt: Date;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.password.changed',
    to: p.to,
    userId: p.userId,
    subject: 'Your Afrizonemart password was changed',
    template: React.createElement(SupplierPasswordChangedEmail, {
      recipientName: p.recipientName,
      changedAtLabel: lagosDateLabel(p.changedAt),
      resetUrl: `${env.WEB_URL}/forgot-password`,
    }),
  });
  logger.info('supplier.email.password_changed', { to: p.to });
}

/** Stage 2 submitted — points straight at the PIQ, not the dashboard. */
export async function notifyEOIReceived(p: {
  to: string;
  userId: string;
  recipientName: string;
}): Promise<void> {
  if (await alreadySent(p.userId, 'supplier.eoi.received')) return;
  await sendEmail({
    type: 'supplier.eoi.received',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    subject: 'Expression of interest received — your next step',
    template: React.createElement(SupplierEOIReceivedEmail, {
      recipientName: p.recipientName,
      piqUrl: piqUrl(),
    }),
  });
  logger.info('supplier.email.eoi_received', { to: p.to });
}

/** Production/content shoot booked by the Take50 team. */
export async function notifyProductionBooked(p: {
  to: string;
  userId: string;
  recipientName: string;
  scheduledAt: Date;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  supplierId?: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.production.booked',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    subject: 'Your Afrizonemart production shoot is booked',
    template: React.createElement(SupplierProductionBookedEmail, {
      recipientName: p.recipientName,
      dateLabel: lagosDateLabel(p.scheduledAt),
      location: p.location,
      contactName: p.contactName,
      contactPhone: p.contactPhone,
      dashboardUrl: stageUrl(8),
    }),
    attachments: p.supplierId
      ? [icsAttachment({
          uid: meetingUid('production', p.supplierId),
          start: p.scheduledAt,
          durationMinutes: 180,
          title: 'Afrizonemart — product content shoot',
          description: [
            'Take50 production shoot for your Afrizonemart listing.',
            'Bring retail-ready samples in final packaging.',
            p.contactName ? `Crew contact: ${p.contactName}${p.contactPhone ? ` (${p.contactPhone})` : ''}` : null,
          ].filter(Boolean).join('\n'),
          location: p.location ?? undefined,
          organiserName: ORGANISER.name,
          organiserEmail: ORGANISER.email,
          attendeeName: p.recipientName,
          attendeeEmail: p.to,
          sequence: Math.floor(Date.now() / 1000),
        }, 'production-shoot.ics')]
      : undefined,
  });
  logger.info('supplier.email.production_booked', { to: p.to });
}

/** Stage 9 reached — the supplier is trading. */
export async function notifyTradeEngagement(p: {
  to: string;
  userId: string;
  recipientName: string;
  companyName: string;
}): Promise<void> {
  if (await alreadySent(p.userId, 'supplier.trade.engagement')) return;
  await sendEmail({
    type: 'supplier.trade.engagement',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    // Plain and specific. "Congratulations" reads as a campaign subject and is
    // a Gmail Promotions signal; naming the account event keeps it in Primary.
    subject: `${p.companyName} is now active for Afrizonemart orders`,
    template: React.createElement(SupplierTradeEngagementEmail, {
      recipientName: p.recipientName,
      companyName: p.companyName,
      dashboardUrl: stageUrl(9),
    }),
  });
  logger.info('supplier.email.trade_engagement', { to: p.to });
}

export async function notifyPOAcknowledged(p: {
  to: string;
  userId: string;
  recipientName: string;
  poNumber: string;
  deliveryDue: Date;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.po.acknowledged',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    subject: `Purchase order ${p.poNumber} acknowledged`,
    template: React.createElement(SupplierPOAcknowledgedEmail, {
      recipientName: p.recipientName,
      poNumber: p.poNumber,
      deliveryDueLabel: lagosDateLabel(p.deliveryDue),
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.po_acknowledged', { to: p.to });
}

export async function notifyPOUnacknowledged(p: {
  to: string;
  userId: string;
  recipientName: string;
  poNumber: string;
  currency: string;
  totalAmount: number;
  /** Recorded in Notification.context so the cron can tell it already ran. */
  poId?: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.po.unacknowledged',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    context: p.poId ? { poId: p.poId } : undefined,
    subject: `Purchase order ${p.poNumber} is waiting for your acknowledgement`,
    template: React.createElement(SupplierPOUnacknowledgedEmail, {
      recipientName: p.recipientName,
      poNumber: p.poNumber,
      currency: p.currency,
      totalAmount: p.totalAmount,
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.po_unacknowledged', { to: p.to });
}

export async function notifyPODueSoon(p: {
  to: string;
  userId: string;
  recipientName: string;
  poNumber: string;
  deliveryDue: Date;
  /** Recorded in Notification.context so the cron can tell it already ran. */
  poId?: string;
}): Promise<void> {
  await sendEmail({
    type: 'supplier.po.due.soon',
    to: p.to,
    userId: p.userId,
    replyTo: REPLY_TO,
    context: p.poId ? { poId: p.poId } : undefined,
    subject: `Delivery for ${p.poNumber} is due soon`,
    template: React.createElement(SupplierPODueSoonEmail, {
      recipientName: p.recipientName,
      poNumber: p.poNumber,
      deliveryDueLabel: lagosDateLabel(p.deliveryDue),
      dashboardUrl: dashboardUrl(),
    }),
  });
  logger.info('supplier.email.po_due_soon', { to: p.to });
}
