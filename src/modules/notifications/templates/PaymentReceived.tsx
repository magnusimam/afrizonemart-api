import * as React from 'react';
import { formatNGN } from './_brand';
import {
  Button,
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
} from './_layout';

export interface PaymentReceivedProps {
  customerName: string;
  orderNumber: string;
  amount: number;
  method: string;
  paidAt: string;
  receiptUrl: string;
}

export function PaymentReceivedEmail(props: PaymentReceivedProps) {
  return (
    <EmailLayout
      preview={`Payment received for ${props.orderNumber} — ${formatNGN(props.amount)}`}
    >
      <Heading>Payment received ✓</Heading>
      <Paragraph>
        Hi {props.customerName}, we&rsquo;ve received your payment of{' '}
        <strong>{formatNGN(props.amount)}</strong> for order{' '}
        <strong>{props.orderNumber}</strong>. Your order is now being prepared
        for shipment.
      </Paragraph>

      <InfoCard>
        <Row label="Order #" value={props.orderNumber} />
        <Row label="Amount" value={formatNGN(props.amount)} />
        <Row label="Method" value={props.method} />
        <Row label="Paid" value={props.paidAt} />
      </InfoCard>

      <Button href={props.receiptUrl}>View Receipt</Button>

      <Paragraph>Thank you for shopping with Afrizonemart!</Paragraph>
    </EmailLayout>
  );
}

export default PaymentReceivedEmail;
