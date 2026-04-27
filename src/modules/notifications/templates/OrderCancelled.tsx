import * as React from 'react';
import { brand, formatNGN } from './_brand';
import {
  Button,
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
} from './_layout';

export interface OrderCancelledProps {
  customerName: string;
  orderNumber: string;
  reason?: string;
  refundExpected: boolean;
  refundAmount?: number;
  shopUrl: string;
}

export function OrderCancelledEmail(props: OrderCancelledProps) {
  return (
    <EmailLayout
      preview={`Your order ${props.orderNumber} has been cancelled`}
    >
      <Heading>Order cancelled</Heading>
      <Paragraph>
        Hi {props.customerName}, your order{' '}
        <strong>{props.orderNumber}</strong> has been cancelled.
      </Paragraph>

      <InfoCard>
        <Row label="Order #" value={props.orderNumber} />
        {props.reason ? <Row label="Reason" value={props.reason} /> : null}
        {props.refundExpected ? (
          <Row
            label="Refund"
            value={
              props.refundAmount
                ? `${formatNGN(props.refundAmount)} — processing within 5–10 business days`
                : 'Processing within 5–10 business days'
            }
          />
        ) : (
          <Row label="Charges" value="No payment was captured." />
        )}
      </InfoCard>

      <Paragraph>
        We&rsquo;re sorry for the inconvenience. If something went wrong on our
        end and you&rsquo;d like to talk it through, just reply to this email
        — a real human reads every reply.
      </Paragraph>

      <Button href={props.shopUrl}>Continue Shopping</Button>

      <Paragraph>
        <span style={{ color: brand.muted, fontSize: '13px' }}>
          Reference this order number if you contact support.
        </span>
      </Paragraph>
    </EmailLayout>
  );
}

export default OrderCancelledEmail;
