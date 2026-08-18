import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { setRefreshCookie } from '@/modules/auth/controller';
import { z } from 'zod';
import { futureDateString } from '@/lib/date-input';
import {
  applyBodySchema,
  createPIQBodySchema,
  updatePIQBodySchema,
  updateSupplierBodySchema,
} from './schema';
import {
  applyAsSupplier,
  completeStage,
  createPIQ,
  getAudit,
  getPIQ,
  getProductionBooking,
  getStageAnswers,
  getSupplierByUserId,
  getVisit,
  listPIQs,
  requestVisit,
  saveStageAnswers,
  submitPIQ,
  updatePIQ,
  updateSupplier,
} from './service';
import { getOrientation, postOrientationComment } from './orientation.service';
import { getReviewCall, requestReschedule } from './reviewcall.service';
import { acknowledgePO, fulfillPO, getPerformance, listPurchaseOrders } from './trade.service';
import path from 'node:path';
import { uploadImage as uploadImageService, putRaw } from '@/modules/uploads/service';

const idParam = z.object({ id: z.string().min(1) });
const stageParam = z.object({ stage: z.coerce.number().int().min(1).max(10) });
const stageAnswersBody = z.object({ answers: z.record(z.unknown()).default({}) });

/**
 * POST /api/suppliers/apply — combined register + apply.
 * Uses optionalAuth: an authenticated AZM user gets a profile on their
 * existing account; an anonymous maker creates an account + profile and is
 * signed in (refresh cookie set, access token returned).
 */
export async function applyHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = applyBodySchema.parse(req.body);
  const result = await applyAsSupplier(body, req.user?.id);

  if (result.auth) {
    setRefreshCookie(res, result.auth.refreshToken);
    res.status(201).json({
      supplier: result.supplier,
      user: result.auth.user,
      accessToken: result.auth.accessToken,
    });
    return;
  }
  res.status(201).json({ supplier: result.supplier });
}

/** GET /api/suppliers/me — the portal access check + profile read. */
export async function meHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const supplier = await getSupplierByUserId(req.user.id);
  res.json(supplier);
}

/** PATCH /api/suppliers/me — update the supplier's own profile. */
export async function updateMeHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = updateSupplierBodySchema.parse(req.body);
  const supplier = await updateSupplier(req.user.id, body);
  res.json(supplier);
}

/** GET /api/suppliers/me/piqs — list this supplier's products. */
export async function listPIQsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const items = await listPIQs(req.user.id);
  res.json({ items });
}

/** GET /api/suppliers/me/piqs/:id — one product + answers. */
export async function getPIQHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  const piq = await getPIQ(req.user.id, id);
  res.json(piq);
}

/** A visit can't be arranged retroactively, nor booked a decade out. */
const requestVisitBody = z.object({
  preferredDate: futureDateString({ horizonDays: 365 }),
  address: z.string().trim().max(500).optional(),
});

/** GET /api/suppliers/me/visit — the supplier's facility visit. */
export async function getVisitHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json({ visit: await getVisit(req.user.id) });
}

/** GET /api/suppliers/me/production — the supplier's Take50 shoot (null until booked). */
export async function getProductionBookingHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json({ booking: await getProductionBooking(req.user.id) });
}

/** POST /api/suppliers/me/visit/request — propose a date. */
export async function requestVisitHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = requestVisitBody.parse(req.body);
  res.json(await requestVisit(req.user.id, body));
}

/** GET /api/suppliers/me/audit — the supplier's audit report (null until done). */
export async function getAuditHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json({ audit: await getAudit(req.user.id) });
}

/**
 * POST /api/suppliers/me/listing-photo — a supplier uploads a Stage 8 listing
 * image. Scoped to suppliers (no `uploads.write` needed) and forced into the
 * products folder. Returns the public asset URL to store in stage answers.
 */
export async function uploadListingPhotoHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  await getSupplierByUserId(req.user.id); // 404 if not a supplier
  const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
  if (!file) throw HttpError.badRequest('No file uploaded. Use multipart/form-data with a "file" field.');
  const result = await uploadImageService({
    buffer: file.buffer,
    mimeType: file.mimetype,
    size: file.size,
    folder: 'products',
    originalName: file.originalname,
  });
  res.status(201).json(result);
}

/**
 * POST /api/suppliers/me/document — a supporting document for a journey
 * form: business licence, certification, bank letter, product photo.
 *
 * Unlike the listing-photo endpoint this accepts PDFs as well as images,
 * because most compliance paperwork arrives as a PDF. Images still go
 * through the full sniff/allowlist path; PDFs are stored via the raw
 * passthrough, guarded by an explicit mime allowlist here and multer's
 * size limit on the route.
 */
export async function uploadSupplierDocumentHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  await getSupplierByUserId(req.user.id); // 404 if not a supplier
  const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
  if (!file) throw HttpError.badRequest('No file uploaded. Use multipart/form-data with a "file" field.');

  if (file.mimetype === 'application/pdf') {
    const raw = await putRaw({
      buffer: file.buffer,
      mimeType: file.mimetype,
      folder: 'supplier-docs',
    });
    res.status(201).json({ ...raw, originalName: path.basename(file.originalname) });
    return;
  }

  const result = await uploadImageService({
    buffer: file.buffer,
    mimeType: file.mimetype,
    size: file.size,
    folder: 'supplier-docs',
    originalName: file.originalname,
  });
  res.status(201).json(result);
}

/** GET /api/suppliers/me/orientation — webinar config + own comments. */
export async function getOrientationHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json(await getOrientation(req.user.id));
}

const orientationCommentBody = z.object({
  body: z.string().trim().min(1).max(1000),
  atSeconds: z.coerce.number().int().min(0).max(86400).optional(),
});

/** POST /api/suppliers/me/orientation/comments — post a live comment. */
export async function postOrientationCommentHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = orientationCommentBody.parse(req.body);
  res.status(201).json(await postOrientationComment(req.user.id, body));
}

/** GET /api/suppliers/me/review-call — the PIQ review call (null if none). */
export async function getReviewCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json({ call: await getReviewCall(req.user.id) });
}

const rescheduleBody = z.object({ proposedAt: z.string().trim().min(1) });

/** POST /api/suppliers/me/review-call/reschedule — propose a new time. */
export async function rescheduleReviewCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = rescheduleBody.parse(req.body);
  res.json(await requestReschedule(req.user.id, body));
}

/** GET /api/suppliers/me/purchase-orders — Stage 9 POs. */
export async function listPurchaseOrdersHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json({ items: await listPurchaseOrders(req.user.id) });
}

/** POST /api/suppliers/me/purchase-orders/:id/acknowledge */
export async function acknowledgePOHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  res.json(await acknowledgePO(req.user.id, id));
}

/** POST /api/suppliers/me/purchase-orders/:id/fulfill */
export async function fulfillPOHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  res.json(await fulfillPO(req.user.id, id));
}

/** GET /api/suppliers/me/performance — Stage 10 snapshot. */
export async function getPerformanceHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json(await getPerformance(req.user.id));
}

/** GET /api/suppliers/me/stages/:stage — saved journey-form answers. */
export async function getStageHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { stage } = stageParam.parse(req.params);
  res.json({ answers: await getStageAnswers(req.user.id, stage) });
}

/** PUT /api/suppliers/me/stages/:stage — autosave. */
export async function saveStageHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { stage } = stageParam.parse(req.params);
  const { answers } = stageAnswersBody.parse(req.body);
  res.json(await saveStageAnswers(req.user.id, stage, answers));
}

/** POST /api/suppliers/me/stages/:stage/complete — save + advance. */
export async function completeStageHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { stage } = stageParam.parse(req.params);
  const { answers } = stageAnswersBody.parse(req.body);
  res.json(await completeStage(req.user.id, stage, answers));
}

/** POST /api/suppliers/me/piqs — create a product PIQ. */
export async function createPIQHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = createPIQBodySchema.parse(req.body);
  const piq = await createPIQ(req.user.id, body);
  res.status(201).json(piq);
}

/** PUT /api/suppliers/me/piqs/:id — autosave. */
export async function updatePIQHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  const body = updatePIQBodySchema.parse(req.body);
  const piq = await updatePIQ(req.user.id, id, body);
  res.json(piq);
}

/** POST /api/suppliers/me/piqs/:id/submit — send for review. */
export async function submitPIQHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  const piq = await submitPIQ(req.user.id, id);
  res.json(piq);
}
