import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  partialRateBodySchema,
  partialZoneBodySchema,
  upsertRateBodySchema,
  upsertZoneBodySchema,
} from './admin.schema';
import {
  adminCreateRate,
  adminCreateZone,
  adminDeleteRate,
  adminDeleteZone,
  adminListRates,
  adminListZones,
  adminUpdateRate,
  adminUpdateZone,
} from './admin.service';

function idOr400(req: Request, name = 'id'): string {
  const v = req.params[name];
  if (!v) throw HttpError.badRequest(`Missing ${name}`);
  return v;
}

// Zones

export async function adminListZonesHandler(_req: Request, res: Response): Promise<void> {
  res.json(await adminListZones());
}

export async function adminCreateZoneHandler(req: Request, res: Response): Promise<void> {
  const body = upsertZoneBodySchema.parse(req.body);
  res.status(201).json(await adminCreateZone(body));
}

export async function adminUpdateZoneHandler(req: Request, res: Response): Promise<void> {
  const body = partialZoneBodySchema.parse(req.body);
  res.json(await adminUpdateZone(idOr400(req), body));
}

export async function adminDeleteZoneHandler(req: Request, res: Response): Promise<void> {
  await adminDeleteZone(idOr400(req));
  res.status(204).end();
}

// Rates (nested under zone)

export async function adminListRatesHandler(req: Request, res: Response): Promise<void> {
  res.json(await adminListRates(idOr400(req)));
}

export async function adminCreateRateHandler(req: Request, res: Response): Promise<void> {
  const body = upsertRateBodySchema.parse(req.body);
  res.status(201).json(await adminCreateRate(idOr400(req), body));
}

export async function adminUpdateRateHandler(req: Request, res: Response): Promise<void> {
  const body = partialRateBodySchema.parse(req.body);
  res.json(await adminUpdateRate(idOr400(req, 'rateId'), body));
}

export async function adminDeleteRateHandler(req: Request, res: Response): Promise<void> {
  await adminDeleteRate(idOr400(req, 'rateId'));
  res.status(204).end();
}
