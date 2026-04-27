import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  createFieldHandler,
  deleteFieldHandler,
  listFieldsHandler,
  updateFieldHandler,
} from './controller';

export const adminCustomFieldRoutes = Router();

adminCustomFieldRoutes.get('/', asyncHandler(listFieldsHandler));
adminCustomFieldRoutes.post('/', asyncHandler(createFieldHandler));
adminCustomFieldRoutes.patch('/:id', asyncHandler(updateFieldHandler));
adminCustomFieldRoutes.delete('/:id', asyncHandler(deleteFieldHandler));
