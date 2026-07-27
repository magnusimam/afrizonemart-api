/**
 * Add-to-calendar links — no OAuth, no API keys. Produces a Google Calendar
 * "template" URL and an `.ics` body that work for both the supplier and the
 * AZM host. (A full Google Calendar API auto-create can layer on later when
 * service-account creds are provisioned.)
 */

export interface CalendarEvent {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  /** Defaults to start + 30 min. */
  end?: Date;
}

/** YYYYMMDDTHHMMSSZ (UTC basic format). */
function toICalUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function endOf(e: CalendarEvent): Date {
  return e.end ?? new Date(e.start.getTime() + 30 * 60 * 1000);
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toICalUtc(e.start)}/${toICalUtc(endOf(e))}`,
  });
  if (e.description) params.set('details', e.description);
  if (e.location) params.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildIcs(e: CalendarEvent, uid: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Afrizonemart//Supplier Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICalUtc(new Date())}`,
    `DTSTART:${toICalUtc(e.start)}`,
    `DTEND:${toICalUtc(endOf(e))}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    e.description ? `DESCRIPTION:${escapeIcs(e.description)}` : '',
    e.location ? `LOCATION:${escapeIcs(e.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}
