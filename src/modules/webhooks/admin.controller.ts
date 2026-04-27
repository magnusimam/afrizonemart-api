import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import { partialWebhookBodySchema, upsertWebhookBodySchema } from './admin.schema';
import {
  adminCreateWebhook,
  adminDeleteWebhook,
  adminGetWebhook,
  adminListDeliveries,
  adminListWebhooks,
  adminReplayDelivery,
  adminRotateSecret,
  adminUpdateWebhook,
} from './admin.service';

function idOr400(req: Request): string {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing webhook id');
  return id;
}

export async function adminListWebhooksHandler(_req: Request, res: Response): Promise<void> {
  res.json(await adminListWebhooks());
}

export async function adminGetWebhookHandler(req: Request, res: Response): Promise<void> {
  res.json(await adminGetWebhook(idOr400(req)));
}

export async function adminCreateWebhookHandler(req: Request, res: Response): Promise<void> {
  const body = upsertWebhookBodySchema.parse(req.body);
  res.status(201).json(await adminCreateWebhook(body));
}

export async function adminUpdateWebhookHandler(req: Request, res: Response): Promise<void> {
  const body = partialWebhookBodySchema.parse(req.body);
  res.json(await adminUpdateWebhook(idOr400(req), body));
}

export async function adminDeleteWebhookHandler(req: Request, res: Response): Promise<void> {
  await adminDeleteWebhook(idOr400(req));
  res.status(204).end();
}

export async function adminListDeliveriesHandler(req: Request, res: Response): Promise<void> {
  res.json(await adminListDeliveries(idOr400(req)));
}

export async function adminReplayDeliveryHandler(req: Request, res: Response): Promise<void> {
  const webhookId = idOr400(req);
  const deliveryId = req.params.deliveryId;
  if (!deliveryId) throw HttpError.badRequest('Missing delivery id');
  res.json(await adminReplayDelivery(webhookId, deliveryId));
}

export async function adminRotateSecretHandler(req: Request, res: Response): Promise<void> {
  res.json(await adminRotateSecret(idOr400(req)));
}
