import path from 'node:path';
import { existsSync } from 'node:fs';
import { Router, type Request, type Response } from 'express';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';

/**
 * Public orientation assets (mounted at /api/orientation, no auth) — the
 * webinar recording. Streamed from the local file in dev; `res.sendFile`
 * handles HTTP Range requests so the player can seek and sync to "live".
 * In prod, set ORIENTATION_VIDEO_URL to a CDN URL (this route is then unused).
 */
export const orientationPublicRoutes = Router();

orientationPublicRoutes.get('/video', (req: Request, res: Response) => {
  const abs = path.resolve(process.cwd(), env.ORIENTATION_VIDEO_PATH);
  if (!existsSync(abs)) {
    logger.warn('orientation.video.missing', { path: abs });
    res.status(404).json({ error: { message: 'Orientation video not available' } });
    return;
  }
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) {
      res.status(500).end();
    }
  });
});
