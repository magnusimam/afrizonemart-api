import * as React from 'react';
import { formatNGN } from './_brand';
import {
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
} from './_layout';

export interface RefundIssuedProps {
  customerName: string;
  orderNumber: string;
  amount: number;
  reason?: string;
  refundedAt: string;
  method: string;
}

export function RefundIssuedEmail(props: RefundIssuedProps) {
  return (
    <EmailLayout
      preview={`Refund of ${formatNGN(props.amount)} issued for order ${props.orderNumber}`}
    >
      <Heading>Refund issued 💸</Heading>
      <Paragraph>
        Hi {props.customerName}, we&rsquo;ve issued a refund of{' '}
        <strong>{formatNGN(props.amount)}</strong> for your order{' '}
        <strong>{props.orderNumber}</strong>.
      </Paragraph>

      <InfoCard>
        <Row label="Order #" value={props.orderNumber} />
        <Row label="Amount" value={formatNGN(props.amount)} />
        <Row label="Method" value={props.method} />
        <Row label="Issued" value={props.refundedAt} />
        {props.reason ? <Row label="Reason" value={props.reason} /> : null}
      </InfoCard>

      <Paragraph>
        Please allow 5–10 business days for the funds to reflect in your
        account, depending on your bank. If you don&rsquo;t see them by then,
        just reply to this email and we&rsquo;ll chase it up.
      </Paragraph>
    </EmailLayout>
  );
}

export default RefundIssuedEmail;
