import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  reportLowStockHandler,
  reportSalesHandler,
  reportTopCustomersHandler,
  reportTopProductsHandler,
} from './admin.controller';

export const adminReportRoutes = Router();

adminReportRoutes.get('/sales', asyncHandler(reportSalesHandler));
adminReportRoutes.get('/top-products', asyncHandler(reportTopProductsHandler));
adminReportRoutes.get('/top-customers', asyncHandler(reportTopCustomersHandler));
adminReportRoutes.get('/low-stock', asyncHandler(reportLowStockHandler));
