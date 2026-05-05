import * as React from 'react';
import {
  Button,
  EmailLayout,
  Heading,
  InfoCard,
  Paragraph,
  Row,
  SubHeading,
} from './_layout';

export interface StaffInviteProps {
  recipientName: string;
  recipientEmail: string;
  initialPassword: string;
  role: string;
  jobTitle: string | null;
  loginUrl: string;
}

export function StaffInviteEmail(props: StaffInviteProps) {
  // Prefer the human-readable job title in the welcome line; fall back
  // to the security role when the admin didn't set a title.
  const positionLabel = props.jobTitle?.trim() || props.role;
  return (
    <EmailLayout preview="You've been added to the Afrizonemart admin team.">
      <Heading>Welcome to the team, {props.recipientName}.</Heading>
      <Paragraph>
        You've been added as a <strong>{positionLabel}</strong> on the
        Afrizonemart admin console. Use the credentials below to sign in.
      </Paragraph>

      <SubHeading>Your sign-in details</SubHeading>
      <InfoCard>
        <Row label="Sign-in URL" value={props.loginUrl} />
        <Row label="Email" value={props.recipientEmail} />
        <Row label="Password" value={props.initialPassword} />
      </InfoCard>

      <Button href={props.loginUrl}>Sign in to admin</Button>

      <Paragraph>
        <strong>Keep this email private.</strong> The password above is your
        access — don't share it. If you forget it, contact the admin who
        invited you to reset it (you can't reset it yourself).
      </Paragraph>
      <Paragraph>
        After you sign in, the sidebar will only show the sections you've
        been granted access to. If something looks missing, that's expected —
        ask the admin to grant the permission you need.
      </Paragraph>
    </EmailLayout>
  );
}

export default StaffInviteEmail;
