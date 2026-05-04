import { z } from 'zod';
import { ALL_CAPABILITIES } from '@/lib/permissions';

export const createStaffBodySchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(['SELLER', 'ADMIN', 'STAFF']),
    password: z.string().min(8).max(128),
    /// Used when role=STAFF — the per-user capability grants. Ignored
    /// for SELLER and ADMIN (those use their role-default capabilities).
    permissions: z.array(z.enum(ALL_CAPABILITIES as [string, ...string[]])).optional(),
  })
  .refine(
    (v) => v.role !== 'STAFF' || (v.permissions && v.permissions.length > 0),
    {
      message:
        'STAFF role requires at least one permission — pick the sections this person should access.',
      path: ['permissions'],
    },
  );
export type CreateStaffBody = z.infer<typeof createStaffBodySchema>;

export const updateStaffBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['SELLER', 'ADMIN', 'STAFF']).optional(),
  permissions: z.array(z.enum(ALL_CAPABILITIES as [string, ...string[]])).optional(),
  /// Optional password reset by the admin. Setting null/undefined leaves
  /// the existing hash in place.
  password: z.string().min(8).max(128).optional(),
});
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;
