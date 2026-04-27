import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  partialCategoryBodySchema,
  upsertCategoryBodySchema,
} from './admin.schema';
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminListCategories,
  adminUpdateCategory,
} from './admin.service';

export async function adminListCategoriesHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json(await adminListCategories());
}

export async function adminCreateCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = upsertCategoryBodySchema.parse(req.body);
  res.status(201).json(await adminCreateCategory(body));
}

export async function adminUpdateCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing category id');
  const body = partialCategoryBodySchema.parse(req.body);
  res.json(await adminUpdateCategory(id, body));
}

export async function adminDeleteCategoryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing category id');
  await adminDeleteCategory(id);
  res.status(204).end();
}
