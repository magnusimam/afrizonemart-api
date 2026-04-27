import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from './controller';

export const authRoutes = Router();

authRoutes.post('/register', asyncHandler(registerHandler));
authRoutes.post('/login', asyncHandler(loginHandler));
authRoutes.post('/refresh', asyncHandler(refreshHandler));
authRoutes.post('/logout', requireAuth, asyncHandler(logoutHandler));
authRoutes.get('/me', requireAuth, asyncHandler(meHandler));
authRoutes.post('/forgot-password', asyncHandler(forgotPasswordHandler));
authRoutes.post('/reset-password', asyncHandler(resetPasswordHandler));
