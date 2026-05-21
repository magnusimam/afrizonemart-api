import { z } from 'zod';

/**
 * Reusable email field — trims + lowercases BEFORE validating the
 * email format so a user with a leading space (browser autofill,
 * copy-paste) doesn't trip "Invalid email".
 */
const emailField = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email());

/// Phase 11.3 (audit M6): strong-password validator. Rule chosen to
/// block trivial dictionary words ("password", "12345678") without
/// frustrating real users — must contain at least one character
/// outside the lowercase-letter set (digit / uppercase / symbol).
/// 8-char minimum stays; 128-char ceiling stays. Lower bound is the
/// security floor, upper bound prevents bcrypt-cost amplification
/// attacks (long input slows down hash).
const STRONG_PASSWORD_MESSAGE =
  'Password must include a number, a symbol, or an uppercase letter.';
const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine(
    (v) => /[0-9]/.test(v) || /[A-Z]/.test(v) || /[^A-Za-z0-9]/.test(v),
    { message: STRONG_PASSWORD_MESSAGE },
  );

export const registerBodySchema = z.object({
  email: emailField,
  password: passwordField,
  name: z.string().trim().min(1).max(100).optional(),
  /// Tracker #48 — marketing opt-in checkbox on signup. Default
  /// false on both sides; storefront sends true when the customer
  /// explicitly ticks the box.
  marketingOptIn: z.boolean().optional(),
  smsOptIn: z.boolean().optional(),
  /// 2026-05-16 Phase 2 — captured from `?ref=` on landing; passed
  /// here when present. Loose validation (10-char-ish hex) so a
  /// stale link doesn't fail signup; service silently ignores
  /// unknown codes.
  referralCode: z.string().trim().min(4).max(64).optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailField,
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const forgotPasswordBodySchema = z.object({
  email: emailField,
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordField,
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

/// Profile-update body for `PATCH /api/auth/me`. All fields are
/// optional so the storefront can do partial updates (e.g. just the
/// name). Email + password are NOT here — email needs a re-verify
/// flow and password has its own /reset-password endpoint.
export const updateMeBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    /// Loose E.164-ish — leading +, then 7-15 digits. Stricter
    /// validation happens at SMS-send time via Twilio.
    phone: z
      .string()
      .trim()
      .regex(/^\+\d{7,15}$/, 'Use E.164 format like +2348012345678')
      .optional(),
    /// Tracker #48 — marketing consent toggles. Flip from
    /// /account/profile. Sending false also satisfies the
    /// unsubscribe path when the customer is signed in.
    marketingOptIn: z.boolean().optional(),
    smsOptIn: z.boolean().optional(),
    /// 2026-05-16 Phase 2 — date-only birth date (ISO yyyy-mm-dd).
    /// Stored as a UTC midnight timestamp; only month + day matter
    /// for the birthday-bonus cron. Null clears.
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd')
      .nullable()
      .optional(),
    /// 2026-05-21 — self-service profile picture. The storefront +
    /// mobile upload via POST /api/uploads/avatar (any authed user)
    /// then PATCH the returned URL here. Must be on the same R2 host
    /// we issued, so callers can't point avatarUrl at arbitrary URLs.
    /// Pass null to clear.
    avatarUrl: z
      .string()
      .url('Must be a valid URL')
      .max(1024)
      .nullable()
      .optional(),
  })
  .strict();
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

