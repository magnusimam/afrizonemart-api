import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  addNoteBodySchema,
  adminOrderListQuerySchema,
  recordRefundBodySchema,
  updateStatusBodySchema,
} from './admin.schema';
import {
  adminAddNote,
  adminGetOrder,
  adminListOrders,
  adminRecordRefund,
  adminUpdateStatus,
} from './admin.service';

function actorOr401(req: AuthedRequest): string {
  if (!req.user) throw HttpError.unauthorized();
  return req.user.id;
}

function idOr400(req: AuthedRequest): string {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing order id');
  return id;
}

export async function adminListOrdersHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const query = adminOrderListQuerySchema.parse(req.query);
  res.json(await adminListOrders(query));
}

export async function adminGetOrderHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json(await adminGetOrder(idOr400(req)));
}

export async function adminUpdateStatusHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = updateStatusBodySchema.parse(req.body);
  res.json(await adminUpdateStatus(idOr400(req), body, actorOr401(req)));
}

export async function adminAddNoteHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = addNoteBodySchema.parse(req.body);
  res.status(201).json(await adminAddNote(idOr400(req), body, actorOr401(req)));
}

export async function adminRecordRefundHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = recordRefundBodySchema.parse(req.body);
  res.status(201).json(await adminRecordRefund(idOr400(req), body, actorOr401(req)));
}
