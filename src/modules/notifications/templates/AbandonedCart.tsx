import * as React from 'react';
import { formatNGN } from './_brand';
import { Button, EmailLayout, Heading, Paragraph } from './_layout';

export interface AbandonedCartProps {
  customerName: string;
  itemCount: number;
  total: number;
  cartUrl: string;
}

export function AbandonedCartEmail(props: AbandonedCartProps) {
  return (
    <EmailLayout
      preview={`Your cart misses you — ${formatNGN(props.total)} waiting`}
    >
      <Heading>Forget something, {props.customerName}? 🛒</Heading>
      <Paragraph>
        You left {props.itemCount} item{props.itemCount === 1 ? '' : 's'} in
        your cart, totalling{' '}
        <strong>{formatNGN(props.total)}</strong>. We&rsquo;re holding it for
        you — but stock moves fast.
      </Paragraph>
      <Button href={props.cartUrl}>Finish Checkout</Button>
      <Paragraph>
        If you changed your mind, no worries — reply to this email and a
        human will help. We won&rsquo;t send another reminder.
      </Paragraph>
    </EmailLayout>
  );
}

export default AbandonedCartEmail;
