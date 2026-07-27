import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError, type FileFilterCallback } from 'multer';
import { asyncHandler } from '@/middleware/async-handler';
import { optionalAuth, requireAuth } from '@/middleware/auth';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import {
  applyHandler,
  completeStageHandler,
  createPIQHandler,
  getAuditHandler,
  getOrientationHandler,
  getPIQHandler,
  getReviewCallHandler,
  getStageHandler,
  getVisitHandler,
  postOrientationCommentHandler,
  rescheduleReviewCallHandler,
  uploadListingPhotoHandler,
  listPurchaseOrdersHandler,
  acknowledgePOHandler,
  fulfillPOHandler,
  getPerformanceHandler,
  listPIQsHandler,
  meHandler,
  requestVisitHandler,
  saveStageHandler,
  submitPIQHandler,
  updateMeHandler,
  updatePIQHandler,
} from './controller';

/**
 * Supplier portal routes (mounted at /api/suppliers).
 *
 * - POST /apply  : optionalAuth — existing user gets a profile on their
 *                  account; anonymous maker registers + applies in one call.
 * - GET  /me     : requireAuth  — portal access check + profile read.
 * - PATCH /me    : requireAuth  — update own profile.
 *
 * Later phases add /me/piqs, /me/activity, /me/visit, etc.
 */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOADS_MAX_BYTES },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  },
});

/** Translate multer's cb(err) into a 400 instead of a generic 500. */
function withUpload(handler: ReturnType<typeof photoUpload.single>) {
  return (req: Request, res: Response, next: NextFunction) =>
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(HttpError.badRequest(`File too large. Max ${env.UPLOADS_MAX_BYTES} bytes.`));
      }
      if (err instanceof Error) return next(HttpError.badRequest(err.message));
      return next(err);
    });
}

export const supplierRoutes = Router();

supplierRoutes.post('/apply', optionalAuth, asyncHandler(applyHandler));
supplierRoutes.get('/me', requireAuth, asyncHandler(meHandler));
supplierRoutes.patch('/me', requireAuth, asyncHandler(updateMeHandler));
supplierRoutes.get('/me/visit', requireAuth, asyncHandler(getVisitHandler));
supplierRoutes.post('/me/visit/request', requireAuth, asyncHandler(requestVisitHandler));
supplierRoutes.get('/me/audit', requireAuth, asyncHandler(getAuditHandler));
supplierRoutes.post('/me/listing-photo', requireAuth, withUpload(photoUpload.single('file')), asyncHandler(uploadListingPhotoHandler));
supplierRoutes.get('/me/orientation', requireAuth, asyncHandler(getOrientationHandler));
supplierRoutes.post('/me/orientation/comments', requireAuth, asyncHandler(postOrientationCommentHandler));
supplierRoutes.get('/me/review-call', requireAuth, asyncHandler(getReviewCallHandler));
supplierRoutes.post('/me/review-call/reschedule', requireAuth, asyncHandler(rescheduleReviewCallHandler));
supplierRoutes.get('/me/purchase-orders', requireAuth, asyncHandler(listPurchaseOrdersHandler));
supplierRoutes.post('/me/purchase-orders/:id/acknowledge', requireAuth, asyncHandler(acknowledgePOHandler));
supplierRoutes.post('/me/purchase-orders/:id/fulfill', requireAuth, asyncHandler(fulfillPOHandler));
supplierRoutes.get('/me/performance', requireAuth, asyncHandler(getPerformanceHandler));
supplierRoutes.get('/me/stages/:stage', requireAuth, asyncHandler(getStageHandler));
supplierRoutes.put('/me/stages/:stage', requireAuth, asyncHandler(saveStageHandler));
supplierRoutes.post('/me/stages/:stage/complete', requireAuth, asyncHandler(completeStageHandler));
supplierRoutes.get('/me/piqs', requireAuth, asyncHandler(listPIQsHandler));
supplierRoutes.post('/me/piqs', requireAuth, asyncHandler(createPIQHandler));
supplierRoutes.get('/me/piqs/:id', requireAuth, asyncHandler(getPIQHandler));
supplierRoutes.put('/me/piqs/:id', requireAuth, asyncHandler(updatePIQHandler));
supplierRoutes.post('/me/piqs/:id/submit', requireAuth, asyncHandler(submitPIQHandler));
