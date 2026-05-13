import * as React from 'react';
import { formatNGN } from './_brand';
import { Button, EmailLayout, Heading, InfoCard, Paragraph, Row } from './_layout';

/// Tracker #47 — sent on `payment.failed`. The customer placed an
/// order but the gateway returned FAILED. We tell them what happened
/// and link them back to retry on the order page (which can re-init
/// a new payment without losing the cart / order context).

export interface PaymentFailedProps {
  customerName: string;
  orderNumber: string;
  amount: number;
  method: string;
  /// Reason string returned by the gateway, if any. We pass it through
  /// to the customer because it's often actionable ("BIN not
  /// configured", "insufficient funds", "card declined").
  reason: string | null;
  retryUrl: string;
}

export function PaymentFailedEmail(props: PaymentFailedProps) {
  return (
    <EmailLayout
      preview={`We couldn't process your payment for ${props.orderNumber}`}
    >
      <Heading>Payment didn&rsquo;t go through</Heading>
      <Paragraph>
        Hi {props.customerName}, we tried to charge{' '}
        <strong>{formatNGN(props.amount)}</strong> for order{' '}
        <strong>{props.orderNumber}</strong> but the payment was declined by
        the gateway.
      </Paragraph>

      <InfoCard>
        <Row label="Order #" value={props.orderNumber} />
        <Row label="Amount" value={formatNGN(props.amount)} />
        <Row label="Method" value={props.method} />
        {props.reason ? <Row label="Reason" value={props.reason} /> : null}
      </InfoCard>

      <Paragraph>
        Don&rsquo;t worry — your order is being held in our system and the
        items are still reserved. Click below to retry payment, try a
        different card, or pick a different payment method like bank
        transfer.
      </Paragraph>

      <Button href={props.retryUrl}>Retry Payment</Button>

      <Paragraph>
        Need help? Reply to this email and our team will sort it out for you.
      </Paragraph>
    </EmailLayout>
  );
}

export default PaymentFailedEmail;
