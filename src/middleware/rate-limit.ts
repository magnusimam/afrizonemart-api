import rateLimit from 'express-rate-limit';

/**
 * Per-IP rate limiters for the auth surface. Returns a plain JSON
 * response shaped like our error envelope so the frontend's
 * `AuthApiError` parser surfaces a sensible message.
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
 * Register + forgot-password + phone-OTP-start: 5 per IP per hour.
 * Tighter because every request triggers an outbound side effect
 * (DB write / email / SMS).
 */
export const authMutationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonHandler(
    'Too many requests. Wait an hour and try again.',
  ),
});
