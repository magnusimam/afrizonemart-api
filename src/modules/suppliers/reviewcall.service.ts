import { type ReviewCall } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { buildIcs, googleCalendarUrl } from '@/lib/calendar';

/**
 * Stage 5, Step 1 — the PIQ review call. AZM schedules it; the supplier can
 * request a reschedule, but not within RESCHEDULE_CUTOFF_HOURS of the meeting.
 */
export const RESCHEDULE_CUTOFF_HOURS = 24;

async function profileIdOrThrow(userId: string): Promise<string> {
  const p = await prisma.supplierProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!p) throw HttpError.notFound('No supplier profile for this account');
  return p.id;
}

export interface PublicReviewCall {
  status: string;
  scheduledAt: string | null;
  meetingMode: string | null;
  meetingLink: string | null;
  notes: string | null;
  proposedAt: string | null;
  rescheduleCount: number;
  /** Whether the supplier may request a reschedule right now. */
  canReschedule: boolean;
  rescheduleCutoffHours: number;
  /** Add-to-calendar payload (present once scheduled). */
  calendar: { googleUrl: string; ics: string } | null;
}

function rescheduleCutoffPassed(scheduledAt: Date | null): boolean {
  if (!scheduledAt) return true;
  const cutoff = scheduledAt.getTime() - RESCHEDULE_CUTOFF_HOURS * 60 * 60 * 1000;
  return Date.now() >= cutoff;
}

function calendarFor(rc: ReviewCall): PublicReviewCall['calendar'] {
  if (!rc.scheduledAt) return null;
  const desc = [
    'Afrizonemart PIQ review call — a quick session to go through your Product Information Questionnaire before orientation.',
    rc.meetingLink ? `Join: ${rc.meetingLink}` : '',
    rc.notes ? `Notes: ${rc.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const event = {
    title: 'Afrizonemart — PIQ Review Call',
    description: desc,
    location: rc.meetingLink || rc.meetingMode || undefined,
    start: rc.scheduledAt,
  };
  return { googleUrl: googleCalendarUrl(event), ics: buildIcs(event, `reviewcall-${rc.id}@afrizonemart`) };
}

export function toPublicReviewCall(rc: ReviewCall): PublicReviewCall {
  return {
    status: rc.status,
    scheduledAt: rc.scheduledAt ? rc.scheduledAt.toISOString() : null,
    meetingMode: rc.meetingMode ?? null,
    meetingLink: rc.meetingLink ?? null,
    notes: rc.notes ?? null,
    proposedAt: rc.proposedAt ? rc.proposedAt.toISOString() : null,
    rescheduleCount: rc.rescheduleCount,
    canReschedule: rc.status === 'SCHEDULED' && !rescheduleCutoffPassed(rc.scheduledAt),
    rescheduleCutoffHours: RESCHEDULE_CUTOFF_HOURS,
    calendar: calendarFor(rc),
  };
}

export async function getReviewCall(userId: string): Promise<PublicReviewCall | null> {
  const supplierId = await profileIdOrThrow(userId);
  const rc = await prisma.reviewCall.findUnique({ where: { supplierId } });
  return rc ? toPublicReviewCall(rc) : null;
}

export async function requestReschedule(
  userId: string,
  input: { proposedAt: string },
): Promise<PublicReviewCall> {
  const supplierId = await profileIdOrThrow(userId);
  const rc = await prisma.reviewCall.findUnique({ where: { supplierId } });
  if (!rc || rc.status === 'PENDING' || !rc.scheduledAt) {
    throw HttpError.badRequest('There is no scheduled call to reschedule.');
  }
  if (rescheduleCutoffPassed(rc.scheduledAt)) {
    throw HttpError.badRequest(
      `Reschedules must be requested at least ${RESCHEDULE_CUTOFF_HOURS} hours before the call.`,
    );
  }
  const proposed = new Date(input.proposedAt);
  if (Number.isNaN(proposed.getTime()) || proposed.getTime() <= Date.now()) {
    throw HttpError.badRequest('Pick a future date and time.');
  }
  const updated = await prisma.reviewCall.update({
    where: { supplierId },
    data: {
      status: 'RESCHEDULE_REQUESTED',
      proposedAt: proposed,
      rescheduleCount: { increment: 1 },
    },
  });
  return toPublicReviewCall(updated);
}
