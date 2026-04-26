import { Router } from 'express';
import { getHealth } from './controller';

export const healthRoutes = Router();

healthRoutes.get('/', getHealth);
