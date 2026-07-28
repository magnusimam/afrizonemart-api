import { z } from 'zod';

/**
 * Shared validation for user-supplied calendar dates (`YYYY-MM-DD`).
 *
 * Several endpoints take a date a human picked — a proposed facility-visit
 * day, a purchase-order deadline. Each one was originally a bare
 * `z.string()`, which let "2020-01-01" and "next tuesday" both through: the
 * first produced a booking six years in the past, the second an `Invalid
 * Date` and a Prisma 500 rather than a clean 400.
 */

/** Today at 00:00 UTC, as a timestamp. */
function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * A real `YYYY-MM-DD` date, today or later, within `horizonDays`.
 *
 * The "not in the past" test compares date-only in UTC, so someone in a
 * timezone ahead of UTC proposing *today* isn't rejected for being hours
 * behind the server's clock.
 */
export function futureDateString(options: {
  /** How far ahead is still sensible. */
  horizonDays: number;
  /** Shown when the date is before today. */
  pastMessage?: string;
  /** Shown when the date is beyond the horizon. */
  horizonMessage?: string;
}) {
  const { horizonDays, pastMessage, horizonMessage } = options;
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'That is not a real date.')
    .refine(
      (s) => Date.parse(s) >= startOfTodayUtc(),
      pastMessage ?? 'Choose a date from today onwards.',
    )
    .refine(
      (s) => Date.parse(s) <= Date.now() + horizonDays * 86_400_000,
      horizonMessage ?? `Choose a date within the next ${horizonDays} days.`,
    );
}
