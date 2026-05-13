import type { Request, Response } from 'express';
import { z } from 'zod';
import { applyUnsubscribe } from './unsubscribe.service';

const querySchema = z.object({
  token: z.string().min(10).max(500),
});

export async function unsubscribeHandler(req: Request, res: Response) {
  /// Tracker #48 — public, no auth. The signed token IS the auth.
  /// Accept GET (link click from email) AND POST (in case marketing
  /// tool wants to confirm with a form). Both behave the same.
  const source =
    req.method === 'GET' ? (req.query as Record<string, unknown>) : req.body;
  const { token } = querySchema.parse(source);
  const result = await applyUnsubscribe(token);
  res.json(result);
}
