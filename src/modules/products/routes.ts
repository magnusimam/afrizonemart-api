import { Router } from 'express';
import { optionalAuth } from '@/middleware/auth';
import { getProductHandler, listProductsHandler } from './controller';

export const productRoutes = Router();

// Public — anyone can browse products
productRoutes.get('/', listProductsHandler);

// Public read, but if a token is present we attribute the view to the user
productRoutes.get('/:slug', optionalAuth, getProductHandler);
