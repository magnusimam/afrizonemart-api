import * as React from 'react';
import { Button, EmailLayout, Heading, Paragraph } from './_layout';

export interface WelcomeProps {
  customerName: string;
  shopUrl: string;
}

export function WelcomeEmail(props: WelcomeProps) {
  return (
    <EmailLayout preview="Welcome to Afrizonemart — Africa, delivered.">
      <Heading>Karibu, {props.customerName}! 👋</Heading>
      <Paragraph>
        Welcome to <strong>Afrizonemart</strong> — your home for authentic
        African groceries, beauty, fashion and home goods, shipped reliably
        across Nigeria.
      </Paragraph>
      <Paragraph>
        Your account is ready. Browse curated collections, save favourites,
        and check out in seconds.
      </Paragraph>
      <Button href={props.shopUrl}>Start Shopping</Button>
      <Paragraph>
        Got a question? Just reply to this email — we read every message.
      </Paragraph>
    </EmailLayout>
  );
}

export default WelcomeEmail;
