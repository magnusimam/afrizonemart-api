import { z } from 'zod';

/**
 * Body validators for the push-token endpoints. Token regex matches
 * Expo's standard format — `ExponentPushToken[<base64>]`. We accept
 * either Expo's wrapped form or a raw FCM/APNs token (length-only
 * sanity check) so the schema stays compatible if we ever swap to
 * native Firebase / APNs SDK on the client.
 */

export const registerTokenSchema = z.object({
  token: z
    .string()
    .min(8, 'Token too short')
    .max(255, 'Token too long')
    .refine(
      (t) => t.startsWith('ExponentPushToken[') || /^[A-Za-z0-9_:.\-]+$/.test(t),
      'Token does not match Expo / FCM / APNs format',
    ),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
});
