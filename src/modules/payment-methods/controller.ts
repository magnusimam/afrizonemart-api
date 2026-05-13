import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  adminCreateBankAccount,
  adminDeleteBankAccount,
  adminGetPaymentMethod,
  adminListBankAccounts,
  adminListPaymentMethods,
  adminUpdateBankAccount,
  adminUpdatePaymentMethod,
  listPublicPaymentMethods,
} from './service';
import {
  upsertBankAccountSchema,
  upsertPaymentMethodSchema,
} from './schema';

const publicQuerySchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().default('NGN'),
  country: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .optional()
    .nullable(),
});

export async function listPublicMethodsHandler(req: Request, res: Response) {
  const q = publicQuerySchema.parse(req.query);
  const data = await listPublicPaymentMethods(q.currency, q.country ?? null);
  res.json(data);
}

export async function adminListMethodsHandler(_req: Request, res: Response) {
  res.json(await adminListPaymentMethods());
}

export async function adminGetMethodHandler(req: Request, res: Response) {
  const id = String(req.params.id);
  res.json(await adminGetPaymentMethod(id));
}

export async function adminUpdateMethodHandler(req: Request, res: Response) {
  const id = String(req.params.id);
  const body = upsertPaymentMethodSchema.parse(req.body);
  res.json(await adminUpdatePaymentMethod(id, body));
}

export async function adminListBankAccountsHandler(_req: Request, res: Response) {
  res.json(await adminListBankAccounts());
}

export async function adminCreateBankAccountHandler(req: Request, res: Response) {
  const body = upsertBankAccountSchema.parse(req.body);
  res.status(201).json(await adminCreateBankAccount(body));
}

export async function adminUpdateBankAccountHandler(req: Request, res: Response) {
  const id = String(req.params.id);
  const body = upsertBankAccountSchema.parse(req.body);
  res.json(await adminUpdateBankAccount(id, body));
}

export async function adminDeleteBankAccountHandler(req: Request, res: Response) {
  const id = String(req.params.id);
  await adminDeleteBankAccount(id);
  res.status(204).end();
}
