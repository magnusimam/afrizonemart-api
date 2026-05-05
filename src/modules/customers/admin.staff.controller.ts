import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  createStaffBodySchema,
  updateStaffBodySchema,
} from './admin.staff.schema';
import {
  createStaff,
  deleteStaff,
  getPermissionsMatrix,
  getStaff,
  listStaff,
  resetAndResendInvite,
  updateStaff,
} from './admin.staff.service';

export async function adminListStaffHandler(_req: Request, res: Response): Promise<void> {
  res.json(await listStaff());
}

export async function adminGetStaffHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing staff id');
  res.json(await getStaff(id));
}

export async function adminCreateStaffHandler(req: Request, res: Response): Promise<void> {
  const body = createStaffBodySchema.parse(req.body);
  res.status(201).json(await createStaff(body));
}

export async function adminUpdateStaffHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing staff id');
  const body = updateStaffBodySchema.parse(req.body);
  res.json(await updateStaff(id, body));
}

export async function adminDeleteStaffHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing staff id');
  await deleteStaff(id);
  res.status(204).end();
}

export async function adminResendInviteHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing staff id');
  res.json(await resetAndResendInvite(id));
}

export function adminGetPermissionsHandler(_req: Request, res: Response): void {
  res.json(getPermissionsMatrix());
}
