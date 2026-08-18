import { describe, expect, it } from 'vitest';

/**
 * Window arithmetic for the supplier lifecycle cron.
 *
 * These bounds are the difference between "a helpful reminder" and "83 real
 * businesses get chased about orders from three months ago because the cron
 * was down for a week". The full behaviour (send, suppress on re-sweep,
 * dry-run) is exercised against a live database; what's locked down here is
 * the arithmetic, which is where an off-by-one silently widens the net.
 *
 * Kept in sync with the constants in lifecycle-cron.ts.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const UNACK_AFTER_MS = 48 * HOUR;
const UNACK_MAX_AGE_MS = 7 * DAY;
const DUE_SOON_WITHIN_MS = 3 * DAY;

/** Mirrors the `createdAt: { gte, lte }` filter for unacknowledged POs. */
function inUnackWindow(issuedAt: Date, now = Date.now()): boolean {
  const lower = now - UNACK_MAX_AGE_MS;
  const upper = now - UNACK_AFTER_MS;
  return issuedAt.getTime() >= lower && issuedAt.getTime() <= upper;
}

/** Mirrors the `dueDate: { gte: now, lte: now + 3d }` filter. */
function inDueSoonWindow(dueDate: Date, now = Date.now()): boolean {
  return dueDate.getTime() >= now && dueDate.getTime() <= now + DUE_SOON_WITHIN_MS;
}

describe('unacknowledged-PO window', () => {
  const now = Date.now();

  it('ignores an order issued moments ago', () => {
    expect(inUnackWindow(new Date(now - 6 * HOUR), now)).toBe(false);
  });

  it('ignores an order issued just under 48h ago', () => {
    expect(inUnackWindow(new Date(now - 47 * HOUR), now)).toBe(false);
  });

  it('catches an order issued 3 days ago', () => {
    expect(inUnackWindow(new Date(now - 3 * DAY), now)).toBe(true);
  });

  it('has an UPPER bound so a recovered cron does not chase ancient orders', () => {
    // The whole point of a bounded window rather than "older than 48h".
    expect(inUnackWindow(new Date(now - 30 * DAY), now)).toBe(false);
    expect(inUnackWindow(new Date(now - 8 * DAY), now)).toBe(false);
  });

  it('includes both edges of the window', () => {
    expect(inUnackWindow(new Date(now - UNACK_AFTER_MS), now)).toBe(true);
    expect(inUnackWindow(new Date(now - UNACK_MAX_AGE_MS), now)).toBe(true);
  });
});

describe('due-soon window', () => {
  const now = Date.now();

  it('catches a delivery due in 2 days', () => {
    expect(inDueSoonWindow(new Date(now + 2 * DAY), now)).toBe(true);
  });

  it('ignores a delivery due next month', () => {
    expect(inDueSoonWindow(new Date(now + 30 * DAY), now)).toBe(false);
  });

  it('ignores an already-overdue delivery', () => {
    // Overdue is a different message with a different tone; this sweep must
    // not claim an order is "due soon" when it is already late.
    expect(inDueSoonWindow(new Date(now - 1 * DAY), now)).toBe(false);
  });

  it('includes both edges', () => {
    expect(inDueSoonWindow(new Date(now), now)).toBe(true);
    expect(inDueSoonWindow(new Date(now + DUE_SOON_WITHIN_MS), now)).toBe(true);
  });
});
