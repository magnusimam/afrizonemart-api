import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { adminGetSettings, adminUpdateSettings } from './admin.service';

const updateBody = z.record(z.string(), z.unknown());

export async function adminGetSettingsHandler(
  _req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json(await adminGetSettings());
}

export async function adminUpdateSettingsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = updateBody.parse(req.body);
  res.json(await adminUpdateSettings(body, req.user.id));
}
