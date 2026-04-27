import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '@/middleware/error-handler';
import { getRatesForCountry } from './service';

const querySchema = z.object({
  country: z.string().length(2),
});

export async function publicGetRatesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { country } = querySchema.parse(req.query);
  res.json(await getRatesForCountry(country));
}
