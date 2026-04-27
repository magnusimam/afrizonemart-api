import * as React from 'react';
import { brand } from './_brand';
import {
  Button,
  EmailLayout,
  Heading,
  Paragraph,
} from './_layout';

export interface PasswordResetProps {
  customerName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export function PasswordResetEmail(props: PasswordResetProps) {
  return (
    <EmailLayout preview="Reset your Afrizonemart password">
      <Heading>Reset your password</Heading>
      <Paragraph>
        Hi {props.customerName}, we received a request to reset the password
        for your Afrizonemart account. Click the button below to choose a new
        one.
      </Paragraph>
      <Button href={props.resetUrl}>Reset Password</Button>
      <Paragraph>
        This link expires in{' '}
        <strong>{props.expiresInMinutes} minutes</strong>. If you didn&rsquo;t
        request a password reset, you can safely ignore this email — your
        password will not change.
      </Paragraph>
      <Paragraph>
        <span style={{ color: brand.muted, fontSize: '13px' }}>
          Trouble with the button? Copy and paste this link into your browser:
          <br />
          <span style={{ wordBreak: 'break-all' }}>{props.resetUrl}</span>
        </span>
      </Paragraph>
    </EmailLayout>
  );
}

export default PasswordResetEmail;
