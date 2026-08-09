import type { Response } from 'express';
import { z } from 'zod';
import { futureDateString } from '@/lib/date-input';
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
  // Unvalidated, this let a PO be issued already overdue.
  dueDate: futureDateString({
    horizonDays: 730,
    pastMessage: 'A delivery deadline cannot be in the past.',
  }).optional(),
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
