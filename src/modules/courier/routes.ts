import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '@/middleware/async-handler';
import { courierConfirmHandler } from './controller';

/**
 * PUBLIC courier confirmation endpoint. No auth — the rider uses
 * a bookmarked URL on their phone. Rate-limited per-IP to slow
 * brute-force OTP scanning (1M-keyspace OTP × 50 attempts / 15 min
 * = effectively zero hit rate even with a botnet).
 */
const courierLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many tries — wait a few minutes and try again.',
    },
  },
});

export const courierRoutes = Router();
courierRoutes.post('/confirm', courierLimiter, asyncHandler(courierConfirmHandler));
