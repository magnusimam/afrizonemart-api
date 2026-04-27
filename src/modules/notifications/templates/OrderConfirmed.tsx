import * as React from 'react';
import { brand, formatNGN } from './_brand';
import {
  Button,
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
  SubHeading,
} from './_layout';

export interface OrderConfirmedProps {
  customerName: string;
  orderNumber: string;
  orderId: string;
  placedAt: string;
  total: number;
  items: Array<{ name: string; qty: number; price: number }>;
  shippingAddress: { line1: string; city: string; region: string; country: string };
  estimatedDelivery: string;
  trackUrl: string;
}

export function OrderConfirmedEmail(props: OrderConfirmedProps) {
  return (
    <EmailLayout
      preview={`Order ${props.orderNumber} confirmed — total ${formatNGN(props.total)}`}
    >
      <Heading>Asante, {props.customerName}! 🎉</Heading>
      <Paragraph>
        Your order <strong>{props.orderNumber}</strong> has been received and
        our team is preparing it for dispatch. We&rsquo;ll email you again the
        moment it ships.
      </Paragraph>

      <InfoCard>
        <Row label="Order #" value={props.orderNumber} />
        <Row label="Placed" value={props.placedAt} />
        <Row label="Total" value={formatNGN(props.total)} />
        <Row label="ETA" value={props.estimatedDelivery} />
      </InfoCard>

      <Button href={props.trackUrl}>Track Your Order</Button>

      <SubHeading>Items</SubHeading>
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        width="100%"
        style={{ borderCollapse: 'collapse', margin: '8px 0 16px 0' }}
      >
        <tbody>
          {props.items.map((it, idx) => (
            <tr key={idx}>
              <td
                style={{
                  borderBottom: `1px solid ${brand.border}`,
                  color: brand.charcoal,
                  fontSize: '14px',
                  padding: '10px 0',
                }}
              >
                {it.name}{' '}
                <span style={{ color: brand.muted }}>× {it.qty}</span>
              </td>
              <td
                style={{
                  borderBottom: `1px solid ${brand.border}`,
                  color: brand.navy,
                  fontSize: '14px',
                  fontWeight: 700,
                  padding: '10px 0',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatNGN(it.price * it.qty)}
              </td>
            </tr>
          ))}
          <tr>
            <td
              style={{
                color: brand.navy,
                fontSize: '15px',
                fontWeight: 700,
                padding: '12px 0',
              }}
            >
              Total
            </td>
            <td
              style={{
                color: brand.amber,
                fontSize: '18px',
                fontWeight: 700,
                padding: '12px 0',
                textAlign: 'right',
              }}
            >
              {formatNGN(props.total)}
            </td>
          </tr>
        </tbody>
      </table>

      <SubHeading>Shipping to</SubHeading>
      <Paragraph>
        {props.shippingAddress.line1}
        <br />
        {props.shippingAddress.city}, {props.shippingAddress.region}
        <br />
        {props.shippingAddress.country}
      </Paragraph>
    </EmailLayout>
  );
}

export default OrderConfirmedEmail;
