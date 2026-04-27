import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import { partialCouponBodySchema, upsertCouponBodySchema } from './admin.schema';
import {
  adminCreateCoupon,
  adminDeleteCoupon,
  adminGetCoupon,
  adminListCoupons,
  adminUpdateCoupon,
} from './admin.service';

function idOr400(req: Request): string {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing coupon id');
  return id;
}

export async function adminListCouponsHandler(_req: Request, res: Response): Promise<void> {
  res.json(await adminListCoupons());
}

export async function adminGetCouponHandler(req: Request, res: Response): Promise<void> {
  res.json(await adminGetCoupon(idOr400(req)));
}

export async function adminCreateCouponHandler(req: Request, res: Response): Promise<void> {
  const body = upsertCouponBodySchema.parse(req.body);
  res.status(201).json(await adminCreateCoupon(body));
}

export async function adminUpdateCouponHandler(req: Request, res: Response): Promise<void> {
  const body = partialCouponBodySchema.parse(req.body);
  res.json(await adminUpdateCoupon(idOr400(req), body));
}

export async function adminDeleteCouponHandler(req: Request, res: Response): Promise<void> {
  await adminDeleteCoupon(idOr400(req));
  res.status(204).end();
}
