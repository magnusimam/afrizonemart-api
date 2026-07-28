import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import {
  cancelPurchaseOrder,
  issuePurchaseOrder,
  listAdminPurchaseOrders,
  listListings,
  publishListing,
} from './admin.trade.service';

const supplierIdParam = z.object({ supplierId: z.string().min(1) });
const idParam = z.object({ id: z.string().min(1) });

export async function listListingsHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listListings() });
}

export async function publishListingHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = supplierIdParam.parse(req.params);
  res.json(await publishListing(supplierId));
}

export async function listPurchaseOrdersHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listAdminPurchaseOrders() });
}

const issueBody = z.object({
  items: z
    .array(
      z.object({
        product: z.string().trim().max(200).optional(),
        qty: z.coerce.number().nonnegative().optional(),
        unit: z.string().trim().max(40).optional(),
        unitPrice: z.coerce.number().nonnegative().optional(),
      }),
    )
    .min(1),
  currency: z.string().trim().max(8).optional(),
  // Was an unvalidated string, so `new Date(...)` could produce an Invalid
  // Date (a Prisma 500 rather than a clean 400) and a delivery deadline could
  // be set in the past — a PO that is overdue the moment it is issued.
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format.')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'That is not a real date.')
    .refine((s) => {
      const now = new Date();
      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      return Date.parse(s) >= todayUtc;
    }, 'A delivery deadline cannot be in the past.')
    .optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function issuePurchaseOrderHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = supplierIdParam.parse(req.params);
  const body = issueBody.parse(req.body);
  res.status(201).json(await issuePurchaseOrder(supplierId, body));
}

export async function cancelPurchaseOrderHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json(await cancelPurchaseOrder(id));
}
