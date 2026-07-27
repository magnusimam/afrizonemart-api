import * as React from 'react';
import { Button, EmailLayout, Heading, Paragraph, SubHeading } from './_layout';

export interface SupplierInviteProps {
  recipientName: string;
  companyName: string;
  setPasswordUrl: string;
  loginUrl: string;
}

export function SupplierInviteEmail(props: SupplierInviteProps) {
  return (
    <EmailLayout preview="Set up your Afrizonemart supplier dashboard.">
      <Heading>Welcome to Afrizonemart, {props.companyName}.</Heading>
      <Paragraph>
        Hi {props.recipientName}, we’ve moved supplier onboarding to a dashboard —
        and your application is already in it. You can see exactly where you are
        in the journey and everything you’ve already submitted.
      </Paragraph>

      <SubHeading>Set your password to get in</SubHeading>
      <Paragraph>
        Click below to choose a password you’ll remember, then sign in to your
        supplier dashboard. This link is unique to your account.
      </Paragraph>

      <Button href={props.setPasswordUrl}>Set your password</Button>

      <Paragraph>
        After setting your password you can sign in any time at{' '}
        <a href={props.loginUrl}>{props.loginUrl}</a>. For your security this
        link expires in 14 days — if it lapses, use “Forgot password” on the
        sign-in page to get a new one.
      </Paragraph>
      <Paragraph>
        Didn’t expect this? You can safely ignore this email — no changes are
        made until you set a password.
      </Paragraph>
    </EmailLayout>
  );
}

export default SupplierInviteEmail;
