import * as React from 'react';
import { Button, EmailLayout, Heading, InfoCard, Paragraph, Row } from './_layout';

/** Compact set of supplier transactional emails. */

export function PIQSubmittedEmail(p: {
  recipientName: string;
  productName: string;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview={`We’ve received your PIQ for ${p.productName}.`}>
      <Heading>Thanks, {p.recipientName} — we’ve got it.</Heading>
      <Paragraph>
        Your Product Information Questionnaire for <strong>{p.productName}</strong>{' '}
        has been submitted for review. Our Merchandise Sourcing team will go
        through it and get back to you — you’ll see the status update right on
        your dashboard.
      </Paragraph>
      <Button href={p.dashboardUrl}>View your dashboard</Button>
    </EmailLayout>
  );
}

export function PIQApprovedEmail(p: {
  recipientName: string;
  productName: string;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview={`${p.productName} has been approved.`}>
      <Heading>Good news — {p.productName} is approved! 🎉</Heading>
      <Paragraph>
        Hi {p.recipientName}, your product has passed review. We’ll continue
        moving you through the journey — check your dashboard for what’s next.
      </Paragraph>
      <Button href={p.dashboardUrl}>See what’s next</Button>
    </EmailLayout>
  );
}

export function PIQChangesEmail(p: {
  recipientName: string;
  productName: string;
  summary: string;
  editUrl: string;
}) {
  return (
    <EmailLayout preview={`A few changes needed on ${p.productName}.`}>
      <Heading>A couple of tweaks on {p.productName}</Heading>
      <Paragraph>
        Hi {p.recipientName}, we’ve reviewed your product and it’s almost there.
        Here’s what our team noted:
      </Paragraph>
      <InfoCard>
        <Row label="Reviewer note" value={p.summary} />
      </InfoCard>
      <Paragraph>
        Open the questionnaire to see the specific fields flagged, update them,
        and resubmit — it only takes a few minutes.
      </Paragraph>
      <Button href={p.editUrl}>Update your PIQ</Button>
    </EmailLayout>
  );
}

const OUTCOME_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  PROVISIONAL: 'Provisional — corrective actions required',
  REJECTED: 'Not yet ready — remediation required',
};

export function AuditCompleteEmail(p: {
  recipientName: string;
  outcome: string;
  indicativeScore: number;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview="Your Afrizonemart product audit report is ready.">
      <Heading>Your product audit report is ready.</Heading>
      <Paragraph>
        Hi {p.recipientName}, our Quality &amp; Compliance team has completed the
        Supplier Product-Commodity Audit of your facility and products.
      </Paragraph>
      <InfoCard>
        <Row label="Outcome" value={OUTCOME_LABELS[p.outcome] ?? p.outcome} />
        <Row label="Indicative score" value={`${p.indicativeScore} / 100`} />
      </InfoCard>
      <Paragraph>
        Open your dashboard to read the full diagnostic report — the outcome,
        every checkpoint rating, the team’s findings, and the corrective actions
        (CAPA) are all there.
      </Paragraph>
      <Button href={p.dashboardUrl}>View your audit report</Button>
    </EmailLayout>
  );
}

export function ListingPublishedEmail(p: { recipientName: string; dashboardUrl: string }) {
  return (
    <EmailLayout preview="Your product is now live on Afrizonemart.">
      <Heading>You’re live on Afrizonemart! 🎉</Heading>
      <Paragraph>
        Hi {p.recipientName}, our Product Upload team has published your product
        across the Afrizonemart platforms. You’re now an activated supplier and
        eligible to receive purchase orders.
      </Paragraph>
      <Button href={p.dashboardUrl}>View your dashboard</Button>
    </EmailLayout>
  );
}

export function POIssuedEmail(p: {
  recipientName: string;
  poNumber: string;
  currency: string;
  totalAmount: number;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview={`New purchase order ${p.poNumber} from Afrizonemart.`}>
      <Heading>You’ve received a purchase order.</Heading>
      <Paragraph>
        Hi {p.recipientName}, Afrizonemart Procurement has issued you a new
        purchase order. Please review and acknowledge it from your dashboard.
      </Paragraph>
      <InfoCard>
        <Row label="PO number" value={p.poNumber} />
        <Row label="Total" value={`${p.currency} ${p.totalAmount.toLocaleString()}`} />
      </InfoCard>
      <Button href={p.dashboardUrl}>Review &amp; acknowledge</Button>
    </EmailLayout>
  );
}

export function ReviewCallScheduledEmail(p: {
  recipientName: string;
  dateLabel: string;
  meetingMode: string | null;
  meetingLink: string | null;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview="Your Afrizonemart PIQ review call is scheduled.">
      <Heading>Your PIQ review call is scheduled.</Heading>
      <Paragraph>
        Hi {p.recipientName}, we’ve booked a quick call to go through your Product
        Information Questionnaire before orientation.
      </Paragraph>
      <InfoCard>
        <Row label="When" value={p.dateLabel} />
        {p.meetingMode ? <Row label="How" value={p.meetingMode} /> : null}
        {p.meetingLink ? <Row label="Join link" value={p.meetingLink} /> : null}
      </InfoCard>
      <Paragraph>
        Add it to your calendar from your dashboard. Need a different time? You
        can request a reschedule there up to 24 hours before the call.
      </Paragraph>
      <Button href={p.dashboardUrl}>View & add to calendar</Button>
    </EmailLayout>
  );
}

export function VisitConfirmedEmail(p: {
  recipientName: string;
  dateLabel: string;
  window: string | null;
  address: string | null;
  leadName: string | null;
  leadPhone: string | null;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview="Your Afrizonemart facility visit is confirmed.">
      <Heading>Your facility visit is confirmed.</Heading>
      <Paragraph>
        Hi {p.recipientName}, our Facility Visit team will see you then. Please
        have your production site ready for the walkthrough.
      </Paragraph>
      <InfoCard>
        <Row label="Date" value={`${p.dateLabel}${p.window ? ` · ${p.window}` : ''}`} />
        {p.address ? <Row label="Address" value={p.address} /> : null}
        {p.leadName ? <Row label="Team lead" value={`${p.leadName}${p.leadPhone ? ` · ${p.leadPhone}` : ''}`} /> : null}
      </InfoCard>
      <Button href={p.dashboardUrl}>View in your dashboard</Button>
    </EmailLayout>
  );
}
