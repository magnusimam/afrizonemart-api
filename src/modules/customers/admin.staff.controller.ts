import type { Request, Response } from 'express';
import { createStaffBodySchema } from './admin.staff.schema';
import {
  createStaff,
  getPermissionsMatrix,
  listStaff,
} from './admin.staff.service';

export async function adminListStaffHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json(await listStaff());
}

export async function adminCreateStaffHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = createStaffBodySchema.parse(req.body);
  res.status(201).json(await createStaff(body));
}

export function adminGetPermissionsHandler(_req: Request, res: Response): void {
  res.json(getPermissionsMatrix());
}
