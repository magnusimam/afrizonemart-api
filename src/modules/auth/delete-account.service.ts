import { prisma } from '@/infra/prisma';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { HttpError } from '@/middleware/error-handler';

/**
 * In-app account deletion.
 *
 * Required by Google Play (as of mid-2024 every app that supports
 * sign-in must let the user delete their account from inside the
 * app, not just via web). Our path: anonymise + tombstone now,
 * cron-hard-delete later (deferred follow-up).
 *
 * **What we scrub immediately** (single transaction):
 *   - User row: email → synthetic deleted-marker, name, phone,
 *     avatar, password hash, refresh-token hash. Lock the row so
 *     no one can sign back in.
 *   - Addresses, wishlist, cart, push tokens, marketing/sms opt-ins
 *     → fully deleted.
 *   - Reviews → author name anonymised to "Anonymous reviewer."
 *     Body kept (review content is valuable to other shoppers and
 *     not personally identifying once the author name is gone).
 *
 * **What we KEEP linked to the userId** (required for legal +
 * accounting + audit reasons):
 *   - Orders — financial records. PII on the order row (shipping
 *     name, phone, address) is wiped; the order itself stays.
 *   - Loyalty ledger — gets anonymised account; ledger entries
 *     stay for refund clawback + audit. Balance zeroed.
 *   - Order events, payment records, refunds — pure operational
 *     records, no PII to scrub.
 *
 * `eventBus.emit('user.deleted', { userId })` lets downstream
 * dispatchers (notifications, webhooks) react — today it drops
 * any pending welcome/abandoned-cart emails for this user.
 */

interface DeleteAccountInput {
  userId: string;
  /// Free-text confirmation string the client collected from the
  /// user. Service requires the EXACT phrase to defend against
  /// accidental clicks. Case-insensitive.
  confirmation: string;
  /// Optional reason — captured in the audit log + emitted with the
  /// event for cohort analysis. Never surfaced back to the customer.
  reason?: string | null;
}

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

export async function deleteOwnAccount(input: DeleteAccountInput): Promise<void> {
  if (input.confirmation.trim().toUpperCase() !== CONFIRMATION_PHRASE) {
    throw HttpError.badRequest(
      `Type "${CONFIRMATION_PHRASE}" exactly to confirm.`,
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, deletedAt: true },
  });
  if (!user) throw HttpError.notFound('Account not found.');
  if (user.deletedAt) {
    /// Already deleted. Idempotent — return success silently so a
    /// retry from a flaky network can't loop.
    return;
  }

  const now = new Date();
  const tombstoneEmail = `deleted-${user.id}@deleted.afrizonemart.local`;

  await prisma.$transaction(async (tx) => {
    // ── 1. Anonymise the User row ──────────────────────────────────
    await tx.user.update({
      where: { id: user.id },
      data: {
        email: tombstoneEmail,
        name: 'Deleted user',
        phone: null,
        avatarUrl: null,
        /// Bcrypt placeholder that can never match any password —
        /// no characters in this string are valid bcrypt output.
        passwordHash: 'DELETED_ACCOUNT_NO_LOGIN',
        /// Kill the active refresh token so existing sessions
        /// can't refresh into new access tokens.
        refreshTokenHash: null,
        /// Drop the customer back to the default role in case they
        /// had any elevated permissions — defence in depth.
        role: 'CUSTOMER',
        permissions: [],
        jobTitle: null,
        marketingOptIn: false,
        smsOptIn: false,
        birthDate: null,
        referralCode: null,
        deletedAt: now,
        /// Lock the row indefinitely so any password-reset attempts
        /// land on the lockout path. Belt + braces with the
        /// nonsense passwordHash above.
        lockedUntil: new Date('9999-01-01T00:00:00Z'),
      },
    });

    // ── 2. Hard-delete the PII-only side tables ────────────────────
    await tx.userAddress.deleteMany({ where: { userId: user.id } });
    await tx.wishlistItem.deleteMany({ where: { userId: user.id } });
    await tx.cart.deleteMany({ where: { userId: user.id } });
    await tx.pushToken.deleteMany({ where: { userId: user.id } });

    // ── 3. Anonymise orders (keep the rows for accounting) ─────────
    /// Orders stay linked by userId so accounting + ledger reports
    /// keep working. PII on the order rows themselves (shipping
    /// snapshot) is wiped. The userId-keyed lookup still works
    /// against the now-tombstoned User row.
    await tx.order.updateMany({
      where: { userId: user.id },
      data: {
        shipFullName: 'Deleted user',
        shipPhone: '',
        shipAddressLine: 'Address removed',
        shipCity: '',
      },
    });

    // ── 4. Zero the loyalty account (keep ledger for clawback) ─────
    await tx.loyaltyAccount.updateMany({
      where: { userId: user.id },
      data: { coinBalance: 0 },
    });

    // ── 5. Anonymise reviews (keep the text, drop identity) ───────
    /// 2026-06-05 — Review.userId now exists (migration
    /// 20260605130000_review_user_id). Rewrite authorName to
    /// "Anonymous reviewer" + null out userId. The FK SET NULL
    /// would clear userId on a hard-delete but we want both — name
    /// + id — gone in the same write.
    await tx.review.updateMany({
      where: { userId: user.id },
      data: {
        authorName: 'Anonymous reviewer',
        userId: null,
      },
    });
  });

  logger.info('auth.account_deleted', {
    userId: user.id,
    reason: input.reason?.slice(0, 240) ?? null,
  });

  /// Emit AFTER the tx commits so downstream subscribers can't see
  /// a half-deleted state. Convention enforced everywhere — see
  /// `ORDER_LIFECYCLE.md`.
  await eventBus.emit('user.deleted', { userId: user.id });
}
