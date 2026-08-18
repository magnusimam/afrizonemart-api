import { brand } from './templates/_brand';
import type { EmailAttachment } from './email-provider';

/**
 * iCalendar (RFC 5545) invites for supplier meetings.
 *
 * Attaching a real .ics is what turns "we emailed them a date" into an entry
 * in both calendars: the supplier accepts from their mail client, and the AZM
 * organiser gets it in theirs, without anyone retyping the details or
 * remembering to create the event by hand.
 *
 * Deliberately hand-rolled rather than pulling a dependency — an invite is a
 * few dozen bytes of well-specified text, and the fiddly parts (UTC stamps,
 * line folding, escaping) are each a handful of lines below.
 */

export interface CalendarInvite {
  /** Stable across updates to the same meeting — this is what lets a reschedule
   *  replace the original entry instead of creating a second one. */
  uid: string;
  start: Date;
  /** Defaults to 60 minutes when omitted. */
  durationMinutes?: number;
  title: string;
  description?: string;
  location?: string;
  organiserName: string;
  organiserEmail: string;
  attendeeName?: string;
  attendeeEmail: string;
  /** Bump on every change to the same UID or clients ignore the update. */
  sequence?: number;
  /** CANCEL withdraws a previously sent invite. */
  method?: 'REQUEST' | 'CANCEL';
}

/** RFC 5545 wants UTC as YYYYMMDDTHHMMSSZ with no punctuation. */
function toICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape per RFC 5545 §3.3.11. Backslash first — escaping it after the others
 * would double-escape the backslashes they introduce.
 */
function esc(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 **octets** per line (§3.1). Outlook in particular rejects invites
 * with over-long lines, and a description carrying a meeting link exceeds it
 * easily. Continuation lines begin with a single space.
 *
 * Octets, not characters: our own copy contains em-dashes ("Afrizonemart —"),
 * and supplier names are routinely non-ASCII, each costing 2–4 bytes in UTF-8.
 * Counting characters would emit over-long lines and — worse — could split a
 * multi-byte sequence across the fold, corrupting the character. Buffer slicing
 * with a codepoint-aware walk avoids both.
 */
function fold(line: string): string {
  if (Buffer.byteLength(line) <= 75) return line;

  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  // First line allows 75 octets; continuations lose one to the leading space.
  let limit = 75;

  // Iterating the string yields whole codepoints, so a character is never split.
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch);
    if (currentBytes + chBytes > limit) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      limit = 74;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);

  return out.map((l, i) => (i === 0 ? l : ' ' + l)).join('\r\n');
}

export function buildICS(invite: CalendarInvite): string {
  const method = invite.method ?? 'REQUEST';
  const start = invite.start;
  const end = new Date(start.getTime() + (invite.durationMinutes ?? 60) * 60_000);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Afrizonemart//Supplier Portal//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${invite.uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SEQUENCE:${invite.sequence ?? 0}`,
    `SUMMARY:${esc(invite.title)}`,
    invite.description ? `DESCRIPTION:${esc(invite.description)}` : null,
    invite.location ? `LOCATION:${esc(invite.location)}` : null,
    `ORGANIZER;CN=${esc(invite.organiserName)}:mailto:${invite.organiserEmail}`,
    `ATTENDEE;CN=${esc(invite.attendeeName ?? invite.attendeeEmail)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${invite.attendeeEmail}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);

  // CRLF is required by the spec, not stylistic — some clients reject LF-only.
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Wrap an invite as a mail attachment. */
export function icsAttachment(invite: CalendarInvite, filename = 'invite.ics'): EmailAttachment {
  return {
    filename,
    content: buildICS(invite),
    contentType: `text/calendar; charset=utf-8; method=${invite.method ?? 'REQUEST'}`,
  };
}

/**
 * Stable UID per supplier per meeting type, so rescheduling the same meeting
 * updates the existing calendar entry rather than leaving the old one behind.
 */
export function meetingUid(kind: string, supplierId: string): string {
  return `${kind}-${supplierId}@afrizonemart.com`;
}

export const ORGANISER = {
  name: 'Afrizonemart Supplier Team',
  email: brand.supportEmail,
} as const;
