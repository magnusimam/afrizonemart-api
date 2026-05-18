import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  finalizePayoutBodySchema,
  listPayoutsQuerySchema,
  payoutWindowSchema,
} from './schema';
import {
  cancelPayoutDraft,
  createPayoutDraft,
  finalizePayout,
  getPayout,
  listPayouts,
  previewPayout,
} from './service';

type AuthedReq = Request & { user?: { id: string; email: string } };

export async function listPayoutsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const query = listPayoutsQuerySchema.parse(req.query);
  res.json(await listPayouts(query));
}

export async function getPayoutHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing payout id');
  res.json(await getPayout(id));
}

export async function previewPayoutHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const win = payoutWindowSchema.parse(req.body ?? {});
  res.json(await previewPayout(win));
}

export async function createPayoutDraftHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const win = payoutWindowSchema.parse(req.body ?? {});
  const actorId = (req as AuthedReq).user?.id ?? null;
  res.status(201).json(await createPayoutDraft(win, actorId));
}

export async function finalizePayoutHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing payout id');
  const body = finalizePayoutBodySchema.parse(req.body ?? {});
  res.json(await finalizePayout(id, body));
}

export async function cancelPayoutDraftHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing payout id');
  res.json(await cancelPayoutDraft(id));
}
