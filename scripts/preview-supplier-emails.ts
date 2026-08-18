/**
 * Renders every supplier email to `tmp/email-preview/` and writes an index.html
 * that frames them side by side.
 *
 * This is the pre-push verification pass: it renders the *real* templates with
 * representative data, so what you read in the browser is byte-for-byte what
 * Resend would send. Nothing here touches the network or the database — no
 * email is sent, no Notification row is written.
 *
 *   npm run preview-emails
 *   then open tmp/email-preview/index.html
 *
 * Edge cases are deliberately included as separate entries (a PO in USD rather
 * than NGN, a production booking with no location or contact, an audit that was
 * rejected) because those are the renders that break quietly.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderEmail } from '@/modules/notifications/render';
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
import { SupplierInviteEmail } from '@/modules/notifications/templates/SupplierInvite';
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

const WEB = 'https://afrizonemart.com';
const NAME = 'Adaeze';
const CO = 'Adia Foods Nigeria Ltd';

interface Case {
  /** Notification `type` — matches what lands in /admin/notifications. */
  type: string;
  /** The subject line as `notify.ts` builds it. */
  subject: string;
  /** When this actually fires, in plain language. */
  trigger: string;
  status: 'existing' | 'new';
  el: React.ReactElement;
}

const cases: Case[] = [
  // ── Account & welcome ───────────────────────────────────────────
  {
    type: 'supplier.application.received',
    subject: 'We’ve received your application to supply Afrizonemart',
    trigger: 'Supplier submits “Apply to supply”.',
    status: 'new',
    el: React.createElement(SupplierApplicationReceivedEmail, {
      recipientName: NAME, companyName: CO, dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.invite',
    subject: 'You’ve been invited to supply Afrizonemart',
    trigger: 'Admin invites an imported supplier (the magic link).',
    status: 'existing',
    el: React.createElement(SupplierInviteEmail, {
      recipientName: NAME, companyName: CO,
      setPasswordUrl: `${WEB}/supplier/set-password?token=demo`, loginUrl: `${WEB}/login`,
    }),
  },
  {
    type: 'supplier.welcome',
    subject: 'Welcome to Afrizonemart — how supplier onboarding works',
    trigger: 'First password set / first login. Sends once, ever.',
    status: 'new',
    el: React.createElement(SupplierWelcomeEmail, {
      recipientName: NAME, dashboardUrl: `${WEB}/supplier/dashboard`,
      currentStageName: 'Expression of Interest',
    }),
  },
  {
    type: 'supplier.password.changed',
    subject: 'Your Afrizonemart password was changed',
    trigger: 'Any password change. Security confirmation — no supplier reply-to.',
    status: 'new',
    el: React.createElement(SupplierPasswordChangedEmail, {
      recipientName: NAME, changedAtLabel: 'Friday, 15 August 2026 at 09:12 WAT',
      resetUrl: `${WEB}/forgot-password`,
    }),
  },

  // ── EOI → PIQ ───────────────────────────────────────────────────
  {
    type: 'supplier.eoi.received',
    subject: 'Expression of interest received — your next step',
    trigger: 'Stage 2 completed. Button goes to the PIQ page, not the dashboard.',
    status: 'new',
    el: React.createElement(SupplierEOIReceivedEmail, {
      recipientName: NAME, piqUrl: `${WEB}/supplier/piqs`,
    }),
  },

  // ── Product questionnaires ──────────────────────────────────────
  {
    type: 'supplier.piq.submitted',
    subject: 'We’ve received your PIQ for Palm Oil 5L',
    trigger: 'Supplier submits a product questionnaire.',
    status: 'existing',
    el: React.createElement(PIQSubmittedEmail, {
      recipientName: NAME, productName: 'Palm Oil 5L', dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.piq.approved',
    subject: 'Palm Oil 5L has been approved',
    trigger: 'Reviewer approves the PIQ.',
    status: 'existing',
    el: React.createElement(PIQApprovedEmail, {
      recipientName: NAME, productName: 'Palm Oil 5L', dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.piq.changes',
    subject: 'A few changes needed on Palm Oil 5L',
    trigger: 'Reviewer requests changes, with their notes.',
    status: 'existing',
    el: React.createElement(PIQChangesEmail, {
      recipientName: NAME, productName: 'Palm Oil 5L',
      summary: 'Please attach the current NAFDAC certificate and confirm the shelf life in months.',
      editUrl: `${WEB}/supplier/piqs/demo/edit`,
    }),
  },

  // ── Review call & visit ─────────────────────────────────────────
  {
    type: 'supplier.reviewcall.scheduled',
    subject: 'Your Afrizonemart PIQ review call is scheduled',
    trigger: 'Admin schedules the Stage 5 call.',
    status: 'existing',
    el: React.createElement(ReviewCallScheduledEmail, {
      recipientName: NAME,
      dateLabel: 'Tuesday, 19 August 2026 at 14:00 WAT',
      meetingMode: 'Google Meet', meetingLink: 'https://meet.google.com/demo',
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.visit.confirmed',
    subject: 'Your Afrizonemart facility visit is confirmed',
    trigger: 'Facility-visit team confirms a date.',
    status: 'existing',
    el: React.createElement(VisitConfirmedEmail, {
      recipientName: NAME, dateLabel: 'Thursday, 21 August 2026', window: '10:00 – 13:00 WAT',
      address: '14 Industrial Road, Ikeja, Lagos', leadName: 'Chidi Okafor', leadPhone: '+234 801 234 5678',
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },

  // ── Audit ───────────────────────────────────────────────────────
  {
    type: 'supplier.audit.complete (approved)',
    subject: 'Your Afrizonemart product audit report is ready',
    trigger: 'Audit completed. NOTE: currently fires with no signature gate — see task #10.',
    status: 'existing',
    el: React.createElement(AuditCompleteEmail, {
      recipientName: NAME, outcome: 'APPROVED', indicativeScore: 88,
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.audit.complete (rejected)',
    subject: 'Your Afrizonemart product audit report is ready',
    trigger: 'Same template, worst-case outcome — checks the tone still reads fairly.',
    status: 'existing',
    el: React.createElement(AuditCompleteEmail, {
      recipientName: NAME, outcome: 'REJECTED', indicativeScore: 41,
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },

  // ── Production & trade ──────────────────────────────────────────
  {
    type: 'supplier.production.booked',
    subject: 'Your Afrizonemart production shoot is booked',
    trigger: 'Take50 books the shoot. Trigger still to be wired (task #11).',
    status: 'new',
    el: React.createElement(SupplierProductionBookedEmail, {
      recipientName: NAME, dateLabel: 'Monday, 18 August 2026 at 10:00 WAT',
      location: 'Take50 Studio, 3 Admiralty Way, Lekki, Lagos',
      contactName: 'Samuel Adeyemi', contactPhone: '+234 802 987 6543',
      dashboardUrl: `${WEB}/supplier/stages/8`,
    }),
  },
  {
    type: 'supplier.production.booked (sparse)',
    subject: 'Your Afrizonemart production shoot is booked',
    trigger: 'Same email with location and contact unknown — checks nothing renders as “null”.',
    status: 'new',
    el: React.createElement(SupplierProductionBookedEmail, {
      recipientName: NAME, dateLabel: 'Monday, 18 August 2026 at 10:00 WAT',
      location: null, contactName: null, contactPhone: null,
      dashboardUrl: `${WEB}/supplier/stages/8`,
    }),
  },
  {
    type: 'supplier.listing.published',
    subject: 'Your product is live on Afrizonemart',
    trigger: 'Admin publishes the listing.',
    status: 'existing',
    el: React.createElement(ListingPublishedEmail, {
      recipientName: NAME, dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.trade.engagement',
    subject: 'Congratulations — you’re now trading with Afrizonemart',
    trigger: 'Listing published → Stage 9 reached. Sends once, ever.',
    status: 'new',
    el: React.createElement(SupplierTradeEngagementEmail, {
      recipientName: NAME, companyName: CO, dashboardUrl: `${WEB}/supplier/stages/9`,
    }),
  },

  // ── Purchase orders ─────────────────────────────────────────────
  {
    type: 'supplier.po.issued',
    subject: 'New purchase order PO-2026-1042 from Afrizonemart',
    trigger: 'Buyer issues a PO.',
    status: 'existing',
    el: React.createElement(POIssuedEmail, {
      recipientName: NAME, poNumber: 'PO-2026-1042', currency: 'NGN', totalAmount: 2_450_000,
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.po.acknowledged',
    subject: 'Purchase order PO-2026-1042 acknowledged',
    trigger: 'Supplier acknowledges the PO. Trigger still to be wired (task #9).',
    status: 'new',
    el: React.createElement(SupplierPOAcknowledgedEmail, {
      recipientName: NAME, poNumber: 'PO-2026-1042',
      deliveryDueLabel: 'Friday, 5 September 2026 at 17:00 WAT',
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.po.unacknowledged',
    subject: 'Purchase order PO-2026-1042 is waiting for your acknowledgement',
    trigger: '+48h after issue with no acknowledgement. Needs the lifecycle cron.',
    status: 'new',
    el: React.createElement(SupplierPOUnacknowledgedEmail, {
      recipientName: NAME, poNumber: 'PO-2026-1042', currency: 'NGN', totalAmount: 2_450_000,
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.po.unacknowledged (USD)',
    subject: 'Purchase order PO-2026-1043 is waiting for your acknowledgement',
    trigger: 'Non-NGN currency — checks the money formatter falls back correctly.',
    status: 'new',
    el: React.createElement(SupplierPOUnacknowledgedEmail, {
      recipientName: NAME, poNumber: 'PO-2026-1043', currency: 'USD', totalAmount: 3_200,
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
  {
    type: 'supplier.po.due.soon',
    subject: 'Delivery for PO-2026-1042 is due soon',
    trigger: '−3 days before the delivery date. Needs the lifecycle cron.',
    status: 'new',
    el: React.createElement(SupplierPODueSoonEmail, {
      recipientName: NAME, poNumber: 'PO-2026-1042',
      deliveryDueLabel: 'Friday, 5 September 2026 at 17:00 WAT',
      dashboardUrl: `${WEB}/supplier/dashboard`,
    }),
  },
];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function main() {
  const outDir = join(process.cwd(), 'tmp', 'email-preview');
  mkdirSync(outDir, { recursive: true });

  const rows: string[] = [];
  let failures = 0;

  for (const [i, c] of cases.entries()) {
    const file = `${String(i + 1).padStart(2, '0')}-${c.type.replace(/[^a-z0-9.]+/gi, '-')}.html`;
    try {
      const { html, text } = await renderEmail(c.el);
      writeFileSync(join(outDir, file), html, 'utf8');
      writeFileSync(join(outDir, file.replace(/\.html$/, '.txt')), text, 'utf8');
      rows.push(`<tr>
        <td><span class="pill ${c.status}">${c.status}</span></td>
        <td><code>${esc(c.type)}</code></td>
        <td><strong>${esc(c.subject)}</strong><br><span class="trig">${esc(c.trigger)}</span></td>
        <td><a href="${file}" target="preview">HTML</a> · <a href="${file.replace(/\.html$/, '.txt')}" target="preview">text</a></td>
      </tr>`);
      console.log(`ok    ${c.type}`);
    } catch (err) {
      failures++;
      console.error(`FAIL  ${c.type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const index = `<!doctype html><meta charset="utf-8">
<title>Afrizonemart supplier emails — preview</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:0;display:grid;grid-template-columns:minmax(420px,1fr) 1.2fr;height:100vh}
  .list{overflow:auto;padding:20px;border-right:1px solid #e5e7eb}
  h1{font-size:18px;margin:0 0 4px}
  p.sub{color:#6b7280;margin:0 0 16px}
  table{border-collapse:collapse;width:100%}
  td{border-bottom:1px solid #f1f5f9;padding:9px 8px;vertical-align:top}
  code{font-size:12px;color:#000066}
  .trig{color:#6b7280;font-size:12px}
  .pill{font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:2px 6px;border-radius:10px;font-weight:700}
  .pill.new{background:#FBAC34;color:#1F2937}
  .pill.existing{background:#e5e7eb;color:#6b7280}
  iframe{width:100%;height:100%;border:0}
</style>
<div class="list">
  <h1>Supplier emails — ${cases.length} renders</h1>
  <p class="sub"><span class="pill new">new</span> built this pass ·
     <span class="pill existing">existing</span> already shipped. Click to preview.</p>
  <table>${rows.join('')}</table>
</div>
<iframe name="preview" src="${cases.length ? '01-supplier.application.received.html' : 'about:blank'}"></iframe>`;

  writeFileSync(join(outDir, 'index.html'), index, 'utf8');
  console.log(`\n${cases.length - failures}/${cases.length} rendered → ${join(outDir, 'index.html')}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
