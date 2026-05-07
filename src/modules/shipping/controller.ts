import type { Request, Response } from 'express';
import { z } from 'zod';
import { getRatesForCountry } from './service';
import { getShippingQuotes } from './quote.service';

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

const quoteBodySchema = z.object({
  destination: z.object({
    country: z.string().length(2),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postcode: z.string().max(20).optional(),
    addressLine: z.string().max(300).optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.coerce.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(200),
});

/// POST /api/shipping/quote — returns the merged quote list for a
/// given destination + cart, plus the resolved cart weight + subtotal
/// for display.
export async function publicQuoteHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const input = quoteBodySchema.parse(req.body);
  res.json(await getShippingQuotes(input));
}
