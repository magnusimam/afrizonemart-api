import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  authMutationLimiter,
  authStrictLimiter,
} from '@/middleware/rate-limit';
import {
  forgotPasswordHandler,
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

authRoutes.post('/register', authMutationLimiter, asyncHandler(registerHandler));
authRoutes.post('/login', authStrictLimiter, asyncHandler(loginHandler));
authRoutes.post('/refresh', asyncHandler(refreshHandler));
authRoutes.post('/logout', requireAuth, asyncHandler(logoutHandler));
authRoutes.get('/me', requireAuth, asyncHandler(meHandler));
authRoutes.post('/forgot-password', authMutationLimiter, asyncHandler(forgotPasswordHandler));
authRoutes.post('/reset-password', authStrictLimiter, asyncHandler(resetPasswordHandler));
// Phase Auth.B/C — third-party sign-in
authRoutes.post('/google', authStrictLimiter, asyncHandler(googleSignInHandler));
authRoutes.post('/phone/start', authMutationLimiter, asyncHandler(phoneStartHandler));
authRoutes.post('/phone/verify', authStrictLimiter, asyncHandler(phoneVerifyHandler));
