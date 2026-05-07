import { z } from 'zod';
import { isUrlSchemeAndHostnameSafe } from '@/lib/url-safety';

const eventName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[*]$|^[a-z]+\.[a-z_]+$/, 'Event must look like "order.placed" or "*"');

/// Phase 11.3 (audit H5): SSRF guard at admin-save time. The
/// dispatcher re-checks via DNS at fetch time because resolved IPs
/// can change between save and dispatch.
const safeWebhookUrl = z
  .string()
  .url()
  .max(500)
  .refine(
    (u) => isUrlSchemeAndHostnameSafe(u) === null,
    (u) => ({
      message:
        isUrlSchemeAndHostnameSafe(u)?.reason ??
        'URL is not allowed (private / loopback / metadata target)',
    }),
  );

export const upsertWebhookBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: safeWebhookUrl,
  events: z.array(eventName).min(1).max(50),
  isActive: z.boolean().default(true),
});
export type UpsertWebhookBody = z.infer<typeof upsertWebhookBodySchema>;

export const partialWebhookBodySchema = upsertWebhookBodySchema.partial();
export type PartialWebhookBody = z.infer<typeof partialWebhookBodySchema>;
