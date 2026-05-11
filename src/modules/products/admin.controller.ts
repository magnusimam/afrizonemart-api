import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { z } from 'zod';
import { HttpError } from '@/middleware/error-handler';
import {
  adminListQuerySchema,
  partialProductBodySchema,
  upsertProductBodySchema,
} from './admin.schema';
import {
  adminBulkProductAction,
  adminCreateProduct,
  adminDeleteProduct,
  adminGetProduct,
  adminListProducts,
  adminUpdateProduct,
} from './admin.service';
import { BULK_TEMPLATE_CSV, bulkUploadProducts } from './admin.bulk';
import { applyPriceChange, listPriceHistory } from './pricing.service';

const inlinePriceBodySchema = z
  .object({
    // Either field is optional individually but at least one must
    // be present — the request would be a no-op otherwise.
    price: z.number().int().min(0).optional(),
    comparePrice: z.number().int().min(0).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.price !== undefined || b.comparePrice !== undefined, {
    message: 'Provide at least one of price or comparePrice.',
  });

const bulkUploadBodySchema = z.object({
  csv: z.string().min(1, 'csv body is required'),
});

const bulkActionBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1, 'Pick at least one product').max(500, 'Up to 500 products per call'),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('delete') }),
    z.object({ kind: z.literal('set-in-stock'), value: z.boolean() }),
    z.object({ kind: z.literal('set-category'), categorySlug: z.string().min(1).nullable() }),
  ]),
});

export async function adminListProductsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const query = adminListQuerySchema.parse(req.query);
  res.json(await adminListProducts(query));
}

export async function adminGetProductHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  res.json(await adminGetProduct(id));
}

export async function adminCreateProductHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = upsertProductBodySchema.parse(req.body);
  res.status(201).json(await adminCreateProduct(body, req.user?.id ?? null));
}

export async function adminUpdateProductHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  const body = partialProductBodySchema.parse(req.body);
  res.json(await adminUpdateProduct(id, body, req.user?.id ?? null));
}

export async function adminDeleteProductHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  await adminDeleteProduct(id);
  res.status(204).end();
}

export async function adminBulkUploadHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const { csv } = bulkUploadBodySchema.parse(req.body);
  res.json(await bulkUploadProducts(csv));
}

export async function adminBulkActionHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = bulkActionBodySchema.parse(req.body);
  res.json(await adminBulkProductAction(body.ids, body.action));
}

/**
 * Inline price edit shortcut for /admin/products list rows. Routes
 * the write through `applyPriceChange` so the audit log captures
 * the actor + source ('INLINE'). Returns the canonical result
 * shape so the UI can swap the cell value + show "no change" when
 * the user blurred without changing anything.
 */
export async function adminUpdateProductPriceHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  const body = inlinePriceBodySchema.parse(req.body);
  const result = await applyPriceChange(
    id,
    {
      ...(body.price !== undefined && { price: body.price }),
      ...(body.comparePrice !== undefined && { comparePrice: body.comparePrice }),
    },
    {
      actorId: req.user?.id ?? null,
      source: 'INLINE',
      reason: body.reason,
    },
  );
  res.json(result);
}

/// Price-history drawer feed. Paginated by `limit` (default 50,
/// capped at 200 inside the service).
export async function adminListProductPriceHistoryHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const items = await listPriceHistory(id, limit);
  res.json({ items });
}

export function adminBulkTemplateHandler(_req: AuthedRequest, res: Response): void {
  res
    .type('text/csv')
    .header('Content-Disposition', 'attachment; filename="afrizonemart-products-template.csv"')
    .send(BULK_TEMPLATE_CSV);
}
