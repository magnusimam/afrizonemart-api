import { z } from 'zod';

/**
 * Validation for the product view tracker.
 *
 * `POST /api/views` is the only public endpoint. Body:
 *   productSlug — the PDP slug the client wants to log a view for
 *   sessionId  — opaque UUID minted client-side on first launch.
 *                Used for dedup so a single device's reload-spam
 *                doesn't inflate trending counts. Optional — server
 *                still records the row without it, but dedup falls
 *                back to userId-only (or none for anonymous viewers).
 *
 * Auth: optional. Anonymous viewers count toward trending, only their
 * own "recently viewed" surface needs userId.
 */
export const createViewBodySchema = z.object({
  productSlug: z.string().trim().min(1).max(160),
  sessionId: z.string().trim().min(1).max(80).optional(),
});
export type CreateViewBody = z.infer<typeof createViewBodySchema>;
