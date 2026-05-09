import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  authPasswordResetLimiter,
  authPhoneOtpLimiter,
  authRegisterLimiter,
  authStrictLimiter,
} from '@/middleware/rate-limit';
import {
  forgotPasswordHandler,
  googleChallengeHandler,
  googleSignInHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  phoneStartHandler,
  phoneVerifyHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from './controller';

export const authRoutes = Router();

// 2026-05-09: limits split by cost-of-action. See
// `middleware/rate-limit.ts` for the rationale per tier.
authRoutes.post('/register', authRegisterLimiter, asyncHandler(registerHandler));
authRoutes.post('/login', authStrictLimiter, asyncHandler(loginHandler));
authRoutes.post('/refresh', asyncHandler(refreshHandler));
authRoutes.post('/logout', requireAuth, asyncHandler(logoutHandler));
authRoutes.get('/me', requireAuth, asyncHandler(meHandler));
authRoutes.post('/forgot-password', authPasswordResetLimiter, asyncHandler(forgotPasswordHandler));
authRoutes.post('/reset-password', authStrictLimiter, asyncHandler(resetPasswordHandler));
// Phase Auth.B/C — third-party sign-in
// Phase 11.3 (audit H7): single-use nonce challenge for the GIS popup.
// Sits on the password-reset tier — DB-write only, no SMS cost.
authRoutes.post('/google/challenge', authPasswordResetLimiter, asyncHandler(googleChallengeHandler));
authRoutes.post('/google', authStrictLimiter, asyncHandler(googleSignInHandler));
// SMS-cost tier — Twilio bills per message.
authRoutes.post('/phone/start', authPhoneOtpLimiter, asyncHandler(phoneStartHandler));
authRoutes.post('/phone/verify', authStrictLimiter, asyncHandler(phoneVerifyHandler));
