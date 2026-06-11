import { Router, type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError, type FileFilterCallback } from 'multer';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { requireCapability } from '@/middleware/require-capability';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { uploadAudioHandler, uploadHandler } from './controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOADS_MAX_BYTES },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    // Accept anything image/*; the service does strict mime-type validation.
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOADS_MAX_BYTES },
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    // Accept anything audio/*; the service sniffs magic bytes for the
    // strict allowlist (mp3 / wav / ogg / m4a / aac).
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio uploads are allowed'));
  },
});

/**
 * multer signals errors via `cb(err)` rather than throwing into the
 * promise chain, so they reach Express as a regular `next(err)` —
 * which our central handler treats as a 500 by default. Translate
 * them to 400s with a sensible message.
 */
function translateMulterError(handler: ReturnType<typeof upload.single>) {
  return (req: Request, res: Response, next: NextFunction) =>
    handler(req, res, (err) => {
      if (!err) return next();
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(HttpError.badRequest(`File too large. Max ${env.UPLOADS_MAX_BYTES} bytes.`));
        }
        return next(HttpError.badRequest(err.message));
      }
      if (err instanceof Error) return next(HttpError.badRequest(err.message));
      return next(err);
    });
}

export const uploadRoutes = Router();

// Self-service avatar upload — any authenticated user. Hardcoded
// to the `avatars` folder (controller checks `req.body.folder ??
// req.query.folder` against ALLOWED_FOLDERS; we set it via query
// here so a customer can't drop a file into `products/`). No
// `uploads.write` capability needed — every signed-in user gets
// to set their own profile picture.
uploadRoutes.post(
  '/avatar',
  requireAuth,
  translateMulterError(upload.single('file')),
  (req, _res, next) => {
    // Force the folder server-side regardless of what the client sent.
    req.query.folder = 'avatars';
    next();
  },
  asyncHandler(uploadHandler),
);

// Admin / staff / seller uploads. Auth + uploads.write capability.
// ADMIN passes by default. SELLER gets it via role defaults. STAFF
// gets it via either an explicit permission grant or the implicit
// one tied to products.image-only (the intern image-update workflow).
uploadRoutes.use(requireAuth, requireCapability('uploads.write'));

uploadRoutes.post('/', translateMulterError(upload.single('file')), asyncHandler(uploadHandler));

// Audio upload — admin/staff with uploads.write (inherited above).
// Stored under the fixed `audio/` prefix. Powers the Afrizonemart
// Wrap background-music track set on /admin/wrap.
uploadRoutes.post(
  '/audio',
  translateMulterError(audioUpload.single('file')),
  asyncHandler(uploadAudioHandler),
);
