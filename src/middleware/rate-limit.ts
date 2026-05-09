import rateLimit from 'express-rate-limit';

/**
 * Per-IP rate limiters for the auth surface.
 *
 * **Why limits are split by cost-of-action** (split 2026-05-09 after a
 * customer hit the old `5/hr` ceiling on register from a shared mobile
 * IP):
 *
 *  - Register and login are nearly free per request — DB read/write
 *    only. Limits exist to deter brute force, not to ration cost.
 *  - Forgot-password sends an email (~\$0.001 via Resend). Limit
 *    matters but isn't life-or-death.
 *  - Phone OTP triggers a Twilio SMS (\$0.05–0.10 per message).
 *    Tight limit is essential — the cost is real.
 *
 * Per-account login lockout (audit M7, lives on the User row) is the
 * real defence against credential stuffing on a specific account. The
 * IP limits below are a coarse second layer.
 *
 * Returns a plain JSON response shaped like our error envelope so
 * the frontend's `AuthApiError` parser surfaces a sensible message.
 * The `Retry-After` header is set automatically by `express-rate-
 * limit` when `standardHeaders: true`.
 */
function jsonHandler(message: string) {
  return (_req: unknown, res: {
    status: (code: number) => { json: (body: unknown) => void };
  }) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message,
      },
    });
  };
}

/**
 * Login + verify endpoints: 10 attempts per IP per 15 minutes.
 * Slightly generous so a real user fat-fingering their password
 * won't get locked out, but tight enough to stop brute force.
 * Per-account lockout (M7) catches credential stuffing on a specific
 * account regardless of IP.
 */
export const authStrictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Too many sign-in attempts. Wait 15 minutes and try again.',
  ),
});

/**
 * Register: 30 per IP per hour. DB-write only, near-zero cost. The
 * old `5/hr` ceiling was tuned for SMS-cost endpoints and incorrectly
 * applied here — real customers behind shared NAT (mobile carriers,
 * cafés, schools, office wifi) hit it after only a handful of family
 * members signed up. 30 still blocks bulk-registration spam (with
 * bcrypt at 12 rounds an attacker can't burn through accounts faster
 * than that anyway) while accommodating the shared-IP case.
 */
export const authRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Too many sign-up attempts from this network. Wait a moment and try again, or sign in if you already have an account.',
  ),
});

/**
 * Forgot-password: 10 per IP per hour. Each request sends an email
 * (Resend, ~\$0.001 each). Tight enough to stop bulk
 * password-reset-spam-as-email-enumeration; loose enough that a
 * shared-IP household isn't blocked.
 */
export const authPasswordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Too many password-reset requests. Wait a moment and try again.',
  ),
});

/**
 * Phone OTP start: 5 per IP per hour. Triggers a Twilio SMS at
 * \$0.05–0.10 per message — keep this tight. Twilio Verify
 * additionally rate-limits per phone-number on its side.
 */
export const authPhoneOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Too many SMS code requests. Wait a moment and try again.',
  ),
});

/**
 * Google sign-in challenge: 60 per IP per hour. Pure DB write (creates
 * a GoogleAuthChallenge row that auto-expires after 10min). The
 * challenge fires every time `<GoogleSignInButton>` mounts — opening
 * 3 tabs of /login is 3 challenges in seconds. Multiple users behind
 * a shared IP hit this fast; previously this endpoint was on the
 * 10/hr password-reset tier and burned through during smoke tests.
 *
 * Real cost is a few DB rows; the only failure mode of removing the
 * limit entirely would be write-amplification flooding, which the
 * 10-minute TTL bounds. 60/hr is a comfortable ceiling for the
 * legitimate-use case while keeping a deterrent on flood attempts.
 */
export const authChallengeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Too many sign-in attempts. Wait a moment and try again.',
  ),
});

/**
 * @deprecated Use the cost-tier-specific limiter for the route. Kept
 * as an alias of `authPasswordResetLimiter` so existing callers don't
 * silently change behaviour mid-migration. New routes should pick
 * one of `authRegisterLimiter` / `authPasswordResetLimiter` /
 * `authPhoneOtpLimiter` directly.
 */
export const authMutationLimiter = authPasswordResetLimiter;
