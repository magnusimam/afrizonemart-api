import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '@/middleware/error-handler';
import {
  adminListQuerySchema,
  partialProductBodySchema,
  upsertProductBodySchema,
} from './admin.schema';
import {
  adminCreateProduct,
  adminDeleteProduct,
  adminGetProduct,
  adminListProducts,
  adminUpdateProduct,
} from './admin.service';
import { BULK_TEMPLATE_CSV, bulkUploadProducts } from './admin.bulk';

const bulkUploadBodySchema = z.object({
  csv: z.string().min(1, 'csv body is required'),
});

export async function adminListProductsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const query = adminListQuerySchema.parse(req.query);
  res.json(await adminListProducts(query));
}

export async function adminGetProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  res.json(await adminGetProduct(id));
}

export async function adminCreateProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = upsertProductBodySchema.parse(req.body);
  res.status(201).json(await adminCreateProduct(body));
}

export async function adminUpdateProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  const body = partialProductBodySchema.parse(req.body);
  res.json(await adminUpdateProduct(id, body));
}

export async function adminDeleteProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing product id');
  await adminDeleteProduct(id);
  res.status(204).end();
}

export async function adminBulkUploadHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { csv } = bulkUploadBodySchema.parse(req.body);
  res.json(await bulkUploadProducts(csv));
}

export function adminBulkTemplateHandler(_req: Request, res: Response): void {
  res
    .type('text/csv')
    .header('Content-Disposition', 'attachment; filename="afrizonemart-products-template.csv"')
    .send(BULK_TEMPLATE_CSV);
}
