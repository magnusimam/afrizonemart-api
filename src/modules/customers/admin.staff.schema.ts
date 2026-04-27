import { z } from 'zod';

export const createStaffBodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['SELLER', 'ADMIN']),
  password: z.string().min(8).max(128),
});
export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;
