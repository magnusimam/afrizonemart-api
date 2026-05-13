import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreateBankAccountHandler,
  adminDeleteBankAccountHandler,
  adminGetMethodHandler,
  adminListBankAccountsHandler,
  adminListMethodsHandler,
  adminUpdateBankAccountHandler,
  adminUpdateMethodHandler,
} from './controller';

/// Tracker #46 — admin CRUD for /admin/payment-methods.
/// Mounted under `/api/admin/payment-methods` — capability gate
/// applied at the adminRouter composition level.
export const adminPaymentMethodRoutes = Router();

adminPaymentMethodRoutes.get('/', asyncHandler(adminListMethodsHandler));
adminPaymentMethodRoutes.get('/bank-accounts', asyncHandler(adminListBankAccountsHandler));
adminPaymentMethodRoutes.post('/bank-accounts', asyncHandler(adminCreateBankAccountHandler));
adminPaymentMethodRoutes.put('/bank-accounts/:id', asyncHandler(adminUpdateBankAccountHandler));
adminPaymentMethodRoutes.delete('/bank-accounts/:id', asyncHandler(adminDeleteBankAccountHandler));
adminPaymentMethodRoutes.get('/:id', asyncHandler(adminGetMethodHandler));
adminPaymentMethodRoutes.put('/:id', asyncHandler(adminUpdateMethodHandler));
