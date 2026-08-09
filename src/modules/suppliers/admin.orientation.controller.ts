import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import {
  listOrientationComments,
  listReviewCalls,
  scheduleReviewCall,
  updateOrientationComment,
} from './admin.orientation.service';

export async function listCommentsHandler(req: AuthedRequest, res: Response): Promise<void> {
  const onlyQuestions = req.query.questions === '1' || req.query.questions === 'true';
  res.json({ items: await listOrientationComments(onlyQuestions) });
}

const idParam = z.object({ id: z.string().min(1) });
const updateCommentBody = z.object({
  isQuestion: z.boolean().optional(),
  answered: z.boolean().optional(),
  adminNote: z.string().trim().max(2000).optional(),
});

export async function updateCommentHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = updateCommentBody.parse(req.body);
  res.json(await updateOrientationComment(id, body));
}

export async function listReviewCallsHandler(req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listReviewCalls() });
}

const supplierIdParam = z.object({ supplierId: z.string().min(1) });
const scheduleBody = z.object({
  scheduledAt: z.string().trim().min(1),
  meetingMode: z.string().trim().max(60).optional(),
  meetingLink: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function scheduleReviewCallHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = supplierIdParam.parse(req.params);
  const body = scheduleBody.parse(req.body);
  res.json(await scheduleReviewCall(supplierId, body));
}
