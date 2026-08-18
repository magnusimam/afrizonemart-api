import { describe, expect, it } from 'vitest';
import { buildICS, meetingUid } from '@/modules/notifications/calendar';

/**
 * iCalendar output is hand-rolled, and the failure mode is nasty: a malformed
 * invite doesn't error — the mail client silently declines to show a meeting,
 * so a supplier just never gets the calendar entry and nobody finds out until
 * they miss the call. These lock down the fiddly parts of RFC 5545.
 */

const base = {
  uid: meetingUid('reviewcall', 'sup_123'),
  start: new Date('2026-08-19T13:00:00.000Z'),
  title: 'Afrizonemart — PIQ review call',
  organiserName: 'Afrizonemart Supplier Team',
  organiserEmail: 'support@afrizonemart.com',
  attendeeEmail: 'ada@example.com',
};

/** Undo RFC 5545 line folding so a value can be asserted as one string. */
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('buildICS', () => {
  it('produces a well-formed VCALENDAR/VEVENT', () => {
    const ics = buildICS(base);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    expect((ics.match(/END:VEVENT/g) ?? []).length).toBe(1);
  });

  it('uses CRLF line endings only', () => {
    // Some clients reject LF-only files outright.
    expect(/(?<!\r)\n/.test(buildICS(base))).toBe(false);
  });

  it('writes UTC timestamps in basic format and honours the duration', () => {
    const ics = buildICS({ ...base, durationMinutes: 45 });
    expect(ics).toContain('DTSTART:20260819T130000Z');
    expect(ics).toContain('DTEND:20260819T134500Z');
  });

  it('defaults to a 60 minute meeting', () => {
    expect(buildICS(base)).toContain('DTEND:20260819T140000Z');
  });

  it('escapes semicolons, commas and newlines per §3.3.11', () => {
    const ics = unfold(buildICS({
      ...base,
      attendeeName: 'Adaeze; Nwosu, Ltd',
      description: 'line one\nline two',
    }));
    expect(ics).toContain('Adaeze\\; Nwosu\\, Ltd');
    expect(ics).toContain('line one\\nline two');
    // The raw newline must be gone — an unescaped one ends the property early
    // and everything after it is read as a bogus field.
    expect(/DESCRIPTION:[^\r]*\n(?!\r)/.test(ics)).toBe(false);
  });

  it('keeps a stable UID so a reschedule updates the same entry', () => {
    expect(meetingUid('reviewcall', 'sup_123')).toBe('reviewcall-sup_123@afrizonemart.com');
    expect(buildICS(base)).toContain('UID:reviewcall-sup_123@afrizonemart.com');
  });

  it('carries SEQUENCE so a later invite supersedes the earlier one', () => {
    expect(buildICS({ ...base, sequence: 7 })).toContain('SEQUENCE:7');
  });

  it('marks a CANCEL invite as cancelled', () => {
    const ics = buildICS({ ...base, method: 'CANCEL' });
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  describe('line folding', () => {
    it('folds long lines and prefixes continuations with a space', () => {
      const ics = buildICS({ ...base, description: 'x'.repeat(400) });
      for (const line of ics.split('\r\n')) {
        expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
      }
      expect(ics).toContain('\r\n ');
    });

    it('measures octets, not characters, and never splits a codepoint', () => {
      // Supplier names are routinely non-ASCII; each character here is several
      // bytes, so a character-counting fold would emit over-long lines and
      // could cut a multi-byte sequence in half.
      const ics = buildICS({
        ...base,
        title: 'Afrizonemart — ' + 'Ọ̀ṣun Adéwálé Ẹ̀gbà '.repeat(5),
        description: 'Zoë — café — naïve — ' + 'Ẹ̀'.repeat(80),
      });
      for (const line of ics.split('\r\n')) {
        expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
      }
      // U+FFFD would mean a sequence was cut mid-character.
      expect(ics).not.toContain('�');
      // And the text survives the round trip intact.
      expect(unfold(ics)).toContain('Zoë — café — naïve');
    });
  });

  it('omits optional properties rather than emitting empty ones', () => {
    const ics = buildICS(base);
    expect(ics).not.toContain('LOCATION:');
    expect(ics).not.toContain('DESCRIPTION:\r\n');
  });
});
