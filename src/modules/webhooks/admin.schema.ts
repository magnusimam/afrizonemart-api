import { z } from 'zod';

const eventName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[*]$|^[a-z]+\.[a-z_]+$/, 'Event must look like "order.placed" or "*"');

export const upsertWebhookBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().url().max(500),
  events: z.array(eventName).min(1).max(50),
  isActive: z.boolean().default(true),
});
export type UpsertWebhookBody = z.infer<typeof upsertWebhookBodySchema>;

export const partialWebhookBodySchema = upsertWebhookBodySchema.partial();
export type PartialWebhookBody = z.infer<typeof partialWebhookBodySchema>;
