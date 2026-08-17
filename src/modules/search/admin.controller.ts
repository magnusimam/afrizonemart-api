import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { searchStatsQuerySchema } from './admin.schema';
import { getSearchStatsService } from './admin.service';

/**
 * Admin search-quality dashboard HTTP layer. Mounted at
 * /api/admin/search behind the analytics.read capability gate.
 */
export async function adminSearchStatsHandler(req: AuthedRequest, res: Response): Promise<void> {
  const q = searchStatsQuerySchema.parse(req.query);
  res.json(await getSearchStatsService(q));
}
