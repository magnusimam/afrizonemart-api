import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createField,
  deleteField,
  listFields,
  updateField,
} from './service';
import {
  createFieldSchema,
  listFieldsQuerySchema,
  updateFieldSchema,
} from './schema';

const idParam = z.object({ id: z.string().min(1) });

export async function listFieldsHandler(req: Request, res: Response): Promise<void> {
  const q = listFieldsQuerySchema.parse(req.query);
  res.json({ items: await listFields(q) });
}

export async function createFieldHandler(req: Request, res: Response): Promise<void> {
  const body = createFieldSchema.parse(req.body);
  const def = await createField(body);
  res.status(201).json(def);
}

export async function updateFieldHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = updateFieldSchema.parse(req.body);
  const def = await updateField(id, body);
  res.json(def);
}

export async function deleteFieldHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  await deleteField(id);
  res.status(204).end();
}
