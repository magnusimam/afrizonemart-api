import * as React from 'react';
import {
  Button,
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
} from './_layout';

export interface OrderShippedProps {
  customerName: string;
  orderNumber: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDelivery: string;
  shippedAt: string;
}

export function OrderShippedEmail(props: OrderShippedProps) {
  return (
    <EmailLayout
      preview={`Your order ${props.orderNumber} has shipped — ${props.carrier} ${props.trackingNumber}`}
    >
      <Heading>It&rsquo;s on the way 📦</Heading>
      <Paragraph>
        Hi {props.customerName}, great news — your order{' '}
        <strong>{props.orderNumber}</strong> has just left our warehouse with{' '}
        <strong>{props.carrier}</strong>.
      </Paragraph>

      <InfoCard>
        <Row label="Carrier" value={props.carrier} />
        <Row label="Tracking #" value={props.trackingNumber} />
        <Row label="Shipped" value={props.shippedAt} />
        <Row label="ETA" value={props.estimatedDelivery} />
      </InfoCard>

      {props.trackingUrl ? (
        <Button href={props.trackingUrl}>Track Shipment</Button>
      ) : null}

      <Paragraph>
        We&rsquo;ll let you know the moment it&rsquo;s delivered. Thank you for
        choosing Afrizonemart.
      </Paragraph>
    </EmailLayout>
  );
}

export default OrderShippedEmail;
