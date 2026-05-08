import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/infra/prisma';
import { decryptCredentials, encryptCredentials } from '@/lib/crypto-secret';
import { HttpError } from '@/middleware/error-handler';
import { listProviderDefinitions, getProviderDefinition } from './registry';

const idParam = z.object({ id: z.string().min(1) });

const upsertSchema = z.object({
  provider: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  environment: z.string().min(1).default('sandbox'),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(100),
  currencies: z.array(z.string().length(3)).min(1).default(['NGN']),
  credentials: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Returns the catalogue of providers the platform CAN be configured
 * with. The admin UI uses this to render the "Add gateway" form (one
 * provider per dropdown option, credential fields auto-rendered).
 */
export function listAvailableProvidersHandler(_req: Request, res: Response): void {
  res.json({ items: listProviderDefinitions() });
}

/** Strip credentials before returning — never leak secrets to clients. */
function redact<T extends { credentials: unknown; provider: string }>(row: T) {
  const def = getProviderDefinition(row.provider);
  // Phase 11.3 (audit H9): decrypt first so the "last 4" sanity-check
  // suffix admins use to recognise their key still works after the
  // encryption-at-rest cutover. Legacy plaintext rows pass through
  // untouched.
  const credentials = decryptCredentials(row.credentials as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  if (def) {
    for (const f of def.credentialFields) {
      const v = credentials[f.key];
      if (v === undefined || v === null || v === '') continue;
      // Mask password fields; keep the last 4 chars so admins can sanity-check.
      out[f.key] =
        f.type === 'password'
          ? `••••${String(v).slice(-4)}`
          : v;
    }
  }
  return { ...row, credentials: out };
}

export async function listGatewayConfigsHandler(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.paymentGatewayConfig.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ items: rows.map(redact) });
}

export async function getGatewayConfigHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const row = await prisma.paymentGatewayConfig.findUnique({ where: { id } });
  if (!row) throw HttpError.notFound('Gateway config not found');
  res.json(redact(row));
}

export async function createGatewayConfigHandler(req: Request, res: Response): Promise<void> {
  const body = upsertSchema.parse(req.body);
  const def = getProviderDefinition(body.provider);
  if (!def) throw HttpError.badRequest(`Unknown provider "${body.provider}"`);
  // Validate required credential fields
  for (const f of def.credentialFields) {
    if (f.required && !body.credentials[f.key]) {
      throw HttpError.badRequest(`${def.displayName}: "${f.label}" is required.`);
    }
  }
  // Phase 11.3 (audit H9): encrypt credential values at rest. The
  // envelope is stored as JSON inside the existing JSON column so no
  // schema change is needed.
  const row = await prisma.paymentGatewayConfig.create({
    data: { ...body, credentials: encryptCredentials(body.credentials) },
  });
  res.status(201).json(redact(row));
}

export async function updateGatewayConfigHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = upsertSchema.partial().parse(req.body);
  const existing = await prisma.paymentGatewayConfig.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Gateway config not found');

  // Merge credentials so admin can update one field without re-typing all
  // of them. Empty strings are skipped (preserve current value).
  // Phase 11.3 (audit H9): decrypt the existing row first so we merge
  // plaintexts, then re-encrypt the whole map. Result: any row touched
  // by an admin save migrates from legacy plaintext to envelope form,
  // even when the admin only edits one field.
  let credentials = decryptCredentials(existing.credentials as Record<string, unknown>);
  if (body.credentials) {
    credentials = { ...credentials };
    for (const [k, v] of Object.entries(body.credentials)) {
      if (v === '' || v === null || v === undefined) continue;
      credentials[k] = v;
    }
  }

  const row = await prisma.paymentGatewayConfig.update({
    where: { id },
    data: {
      ...(body.label !== undefined && { label: body.label }),
      ...(body.environment !== undefined && { environment: body.environment }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.currencies !== undefined && { currencies: body.currencies }),
      ...(body.metadata !== undefined && { metadata: body.metadata }),
      credentials: encryptCredentials(credentials),
    },
  });
  res.json(redact(row));
}

export async function deleteGatewayConfigHandler(req: Request, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  await prisma.paymentGatewayConfig.delete({ where: { id } });
  res.status(204).end();
}
