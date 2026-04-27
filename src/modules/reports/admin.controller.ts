import type { Request, Response } from 'express';
import {
  lowStockQuerySchema,
  salesQuerySchema,
  topQuerySchema,
} from './admin.schema';
import {
  reportLowStock,
  reportSales,
  reportTopCustomers,
  reportTopProducts,
} from './admin.service';

export async function reportSalesHandler(req: Request, res: Response): Promise<void> {
  const q = salesQuerySchema.parse(req.query);
  res.json(await reportSales(q));
}

export async function reportTopProductsHandler(req: Request, res: Response): Promise<void> {
  const q = topQuerySchema.parse(req.query);
  res.json(await reportTopProducts(q));
}

export async function reportTopCustomersHandler(req: Request, res: Response): Promise<void> {
  const q = topQuerySchema.parse(req.query);
  res.json(await reportTopCustomers(q));
}

export async function reportLowStockHandler(req: Request, res: Response): Promise<void> {
  const q = lowStockQuerySchema.parse(req.query);
  res.json(await reportLowStock(q));
}
