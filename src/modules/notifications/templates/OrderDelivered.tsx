import * as React from 'react';
import { Button, EmailLayout, Heading, Paragraph } from './_layout';

export interface OrderDeliveredProps {
  customerName: string;
  orderNumber: string;
  reviewUrl: string;
  reorderUrl: string;
}

export function OrderDeliveredEmail(props: OrderDeliveredProps) {
  return (
    <EmailLayout
      preview={`Your order ${props.orderNumber} has been delivered`}
    >
      <Heading>Delivered! 🎁</Heading>
      <Paragraph>
        Hi {props.customerName}, your order <strong>{props.orderNumber}</strong>{' '}
        has been delivered. We hope you love it.
      </Paragraph>
      <Paragraph>
        Your honest review helps other shoppers — and it only takes a minute.
      </Paragraph>
      <Button href={props.reviewUrl}>Leave a Review</Button>
      <Paragraph>
        Need to grab the same items again?{' '}
        <a
          href={props.reorderUrl}
          style={{ color: '#000066', fontWeight: 600 }}
        >
          Reorder in one click
        </a>
        .
      </Paragraph>
    </EmailLayout>
  );
}

export default OrderDeliveredEmail;
