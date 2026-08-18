import * as React from 'react';
import {
  Bullets,
  Button,
  ButtonFallback,
  Callout,
  EmailLayout,
  Eyebrow,
  Heading,
  InfoCard,
  Note,
  Paragraph,
  Row,
  Steps,
  SubHeading,
} from './_layout';
import { formatNGN } from './_brand';

/**
 * Supplier *lifecycle* emails — the journey messages, as distinct from the
 * per-object transactional receipts in `SupplierNotifications.tsx`.
 *
 * The split is deliberate: the receipts there answer "what happened to this
 * PIQ/PO?", while these answer "where am I in the 10-stage journey and what do
 * I do next?". Principle from SUPPLIER_EMAIL_SEQUENCE.md §1: every email names
 * the next action and deep-links straight to it — never a generic dashboard.
 */

/** The journey, single-sourced so the welcome email can't drift from the portal. */
const STAGES = [
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
] as const;

/* ------------------------------------------------------------------ *
 * A · Account & welcome
 * ------------------------------------------------------------------ */

/**
 * The orientation email. Until now a supplier set a password, landed on a
 * dashboard, and had to infer the process — this is the one message that
 * explains the whole shape of it.
 */
export function SupplierWelcomeEmail(p: {
  recipientName: string;
  dashboardUrl: string;
  currentStageName: string;
}) {
  return (
    <EmailLayout
      preview="Welcome to Afrizonemart — here’s how supplier onboarding works."
      eyebrow="Supplier Portal"
    >
      <Eyebrow>Your account is live</Eyebrow>
      <Heading>Welcome aboard, {p.recipientName}.</Heading>
      <Paragraph>
        We work with suppliers through a <strong>10-stage journey</strong>. It
        exists so that by the time your product reaches our buyers, everything
        from your paperwork to your facility has already been checked — nothing
        becomes a surprise later.
      </Paragraph>

      <Callout tone="info">
        You’re at <strong>{p.currentStageName}</strong>. Each stage tells you
        exactly what it needs, and we email you whenever it’s your turn to act.
      </Callout>

      <SubHeading>Do these three things first</SubHeading>
      <Steps
        items={[
          'Open your portal and complete your company profile.',
          'Fill in a Product Information Questionnaire (PIQ) for each product you want to supply.',
          'We review it, then book a call to walk through your answers together.',
        ]}
      />

      <Button href={p.dashboardUrl}>Open your supplier portal</Button>
      <ButtonFallback href={p.dashboardUrl} />

      <SubHeading>The full journey</SubHeading>
      <InfoCard>
        {STAGES.map((name, i) => (
          <Row key={name} label={`Stage ${i + 1}`} value={name} />
        ))}
      </InfoCard>

      <Note>
        Questions at any point? Reply to this email — a person on the supplier
        team reads it.
      </Note>
    </EmailLayout>
  );
}

/** Confirms an application landed, so nobody is left wondering. */
export function SupplierApplicationReceivedEmail(p: {
  recipientName: string;
  companyName: string;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview="We’ve received your application to supply Afrizonemart.">
      <Heading>Thanks, {p.recipientName} — application received.</Heading>
      <Paragraph>
        We’ve got the application for <strong>{p.companyName}</strong>. Our
        sourcing team reviews new suppliers in the order they arrive and will
        come back to you shortly.
      </Paragraph>
      <SubHeading>What happens next</SubHeading>
      <Steps
        items={[
          'We review your application against the categories we’re currently sourcing.',
          'If it’s a fit, you’ll get an invitation to set your password and open your supplier portal.',
          'From there you complete your profile and your first product questionnaire.',
        ]}
      />
      <Button href={p.dashboardUrl}>Track your application</Button>
    </EmailLayout>
  );
}

/** Password changed — a security confirmation, never a marketing moment. */
export function SupplierPasswordChangedEmail(p: {
  recipientName: string;
  changedAtLabel: string;
  resetUrl: string;
}) {
  return (
    <EmailLayout preview="Your Afrizonemart password was changed.">
      <Heading>Your password was changed</Heading>
      <Paragraph>
        Hi {p.recipientName}, the password on your Afrizonemart supplier account
        was changed on <strong>{p.changedAtLabel}</strong>.
      </Paragraph>
      <Paragraph>
        If this was you, nothing further is needed. <strong>If it wasn’t</strong>,
        reset your password immediately and contact us — someone may have access
        to your account.
      </Paragraph>
      <Button href={p.resetUrl}>Reset your password</Button>
    </EmailLayout>
  );
}

/* ------------------------------------------------------------------ *
 * B · Expression of Interest → PIQ
 * ------------------------------------------------------------------ */

/**
 * Stage 2 complete. This is the highest-leverage handoff in the funnel: the
 * supplier has shown intent and the very next thing we need is a PIQ, so the
 * button goes straight to the PIQ page rather than the dashboard.
 */
export function SupplierEOIReceivedEmail(p: {
  recipientName: string;
  piqUrl: string;
}) {
  return (
    <EmailLayout preview="Expression of interest received — your next step is the product questionnaire.">
      <Heading>Got it, {p.recipientName} — you’re through Stage 2.</Heading>
      <Paragraph>
        Thanks for completing your Expression of Interest. Your next step is the{' '}
        <strong>Product Information Questionnaire (PIQ)</strong> — one per
        product you’d like to supply.
      </Paragraph>
      <Paragraph>
        The PIQ is how our buyers and our audit team understand your product:
        what’s in it, how it’s made, how it’s packaged, and what certifications
        it carries. You can save a draft and come back to it.
      </Paragraph>

      <SubHeading>Worth having to hand</SubHeading>
      <Steps
        items={[
          'Your product specification and ingredient or material list.',
          'Packaging details and shelf life, where they apply.',
          'Any certifications you hold (NAFDAC, SON, organic, and similar).',
          'Your production capacity and typical lead time.',
        ]}
      />

      <Button href={p.piqUrl}>Start your product questionnaire</Button>
      <Paragraph>
        Stuck on a question? Reply to this email and we’ll walk you through it.
      </Paragraph>
    </EmailLayout>
  );
}

/* ------------------------------------------------------------------ *
 * G · Partnership → trade
 * ------------------------------------------------------------------ */

/** Production slot booked — the Take50 shoot. */
export function SupplierProductionBookedEmail(p: {
  recipientName: string;
  dateLabel: string;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview="Your Afrizonemart production shoot is booked." eyebrow="Stage 8 · Listing">
      <Eyebrow>Production booked</Eyebrow>
      <Heading>Your product shoot is confirmed</Heading>
      <Paragraph>
        Hi {p.recipientName}, we’ve scheduled the production session for your
        listing. Our production team handles the photography and content that
        will represent your product on Afrizonemart.
      </Paragraph>
      <InfoCard>
        <Row label="Date & time" value={p.dateLabel} />
        {p.location ? <Row label="Location" value={p.location} /> : null}
        {p.contactName ? <Row label="Your contact" value={p.contactName} /> : null}
        {p.contactPhone ? <Row label="Phone" value={p.contactPhone} /> : null}
      </InfoCard>
      <SubHeading>Please have ready on the day</SubHeading>
      <Bullets
        items={[
          'Retail-ready samples of each product being listed, in their final packaging.',
          'Any variants — sizes, flavours, colours — you want photographed.',
          'Someone who can answer questions about the product on the day.',
        ]}
      />
      <Callout tone="warning">
        These photographs become your storefront listing, so packaging condition
        matters. Send fresh stock rather than shelf-worn samples.
      </Callout>
      <Button href={p.dashboardUrl}>View details in your portal</Button>
      <Note>A calendar invite is attached to this email.</Note>
    </EmailLayout>
  );
}

/** Stage 9 — the supplier is now trading. */
export function SupplierTradeEngagementEmail(p: {
  recipientName: string;
  companyName: string;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview="You’re now trading with Afrizonemart." eyebrow="Stage 9 · Trade">
      <Eyebrow>Onboarding complete</Eyebrow>
      {/* No emoji and no exclamation: both are strong Gmail Promotions
          signals, and this needs to reach the Primary tab. The news is good
          enough without decoration. */}
      <Heading>You’ve completed onboarding</Heading>
      <Paragraph>
        {p.companyName} has completed onboarding and reached{' '}
        <strong>Trade Engagement</strong>. Your products are live and eligible
        for Afrizonemart purchase orders.
      </Paragraph>
      <Paragraph>
        Getting here means you’ve passed profiling, product review, orientation
        and a full facility audit. That’s not a small thing — it’s the standard
        our buyers rely on.
      </Paragraph>
      <SubHeading>From here</SubHeading>
      <Bullets
        items={[
          'Purchase orders arrive by email and appear in your portal — acknowledge them promptly.',
          'Keep your stock and lead times current so buyers see what you can actually fulfil.',
          'Track fulfilment and performance from your dashboard.',
        ]}
      />
      <Button href={p.dashboardUrl}>Go to your dashboard</Button>
    </EmailLayout>
  );
}

/* ------------------------------------------------------------------ *
 * Purchase order sequence
 * ------------------------------------------------------------------ */

/** PO acknowledged — closes the loop for the supplier's own records. */
export function SupplierPOAcknowledgedEmail(p: {
  recipientName: string;
  poNumber: string;
  deliveryDueLabel: string;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview={`You’ve acknowledged purchase order ${p.poNumber}.`}>
      <Heading>Purchase order {p.poNumber} acknowledged</Heading>
      <Paragraph>
        Thanks {p.recipientName} — we’ve recorded your acknowledgement. You’re
        committed to delivering by <strong>{p.deliveryDueLabel}</strong>.
      </Paragraph>
      <Paragraph>
        If anything changes with your timeline, tell us early rather than late.
        A revised date we know about is a scheduling adjustment; one we don’t is
        a missed delivery to a buyer.
      </Paragraph>
      <Button href={p.dashboardUrl}>View the order</Button>
    </EmailLayout>
  );
}

/** PO not yet acknowledged — a nudge, not a telling-off. */
export function SupplierPOUnacknowledgedEmail(p: {
  recipientName: string;
  poNumber: string;
  currency: string;
  totalAmount: number;
  dashboardUrl: string;
}) {
  const total =
    p.currency === 'NGN' ? formatNGN(p.totalAmount) : `${p.currency} ${p.totalAmount.toLocaleString()}`;
  return (
    <EmailLayout preview={`Purchase order ${p.poNumber} is waiting for your acknowledgement.`}>
      <Heading>A purchase order is waiting on you</Heading>
      <Paragraph>
        Hi {p.recipientName}, purchase order <strong>{p.poNumber}</strong> was
        issued to you and hasn’t been acknowledged yet.
      </Paragraph>
      <InfoCard>
        <Row label="Purchase order" value={p.poNumber} />
        <Row label="Value" value={total} />
      </InfoCard>
      <Paragraph>
        Acknowledging simply confirms you’ve seen it and can fulfil it. If you
        can’t — that’s useful to know too, and there’s no penalty for saying so.
        Reply to this email and we’ll sort it out.
      </Paragraph>
      <Button href={p.dashboardUrl}>Review the order</Button>
    </EmailLayout>
  );
}

/** Delivery approaching. */
export function SupplierPODueSoonEmail(p: {
  recipientName: string;
  poNumber: string;
  deliveryDueLabel: string;
  dashboardUrl: string;
}) {
  return (
    <EmailLayout preview={`Delivery for ${p.poNumber} is due soon.`}>
      <Heading>Delivery due {p.deliveryDueLabel}</Heading>
      <Paragraph>
        Hi {p.recipientName}, this is a heads-up that purchase order{' '}
        <strong>{p.poNumber}</strong> is due for delivery on{' '}
        <strong>{p.deliveryDueLabel}</strong>.
      </Paragraph>
      <Paragraph>
        If you’re on track, no action needed. If anything has slipped, let us
        know now so we can manage it with the buyer.
      </Paragraph>
      <Button href={p.dashboardUrl}>Update fulfilment status</Button>
    </EmailLayout>
  );
}
