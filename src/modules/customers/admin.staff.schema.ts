import { z } from 'zod';
import { ALL_CAPABILITIES } from '@/lib/permissions';

export const createStaffBodySchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(['SELLER', 'ADMIN', 'STAFF']),
    /// Required for a brand-new account; optional when promoting an
    /// existing customer (they already have a login). The service
    /// enforces "required for new" — see createStaff.
    password: z.string().min(8).max(128).optional(),
    /// Free-form job title — what the admin types in the dialog
    /// ("Intern", "Customer Support Lead", etc.). Cosmetic; does NOT
    /// grant access. Permissions still drive what they can do.
    jobTitle: z.string().trim().min(1).max(80).optional(),
    /// Used when role=STAFF — the per-user capability grants. Ignored
    /// for SELLER and ADMIN (those use their role-default capabilities).
    permissions: z.array(z.enum(ALL_CAPABILITIES as [string, ...string[]])).optional(),
    /// Explicit confirm to promote an EXISTING customer in place
    /// (keeps their account, orders + login; just elevates role +
    /// permissions). Without it, an existing-customer email returns a
    /// CUSTOMER_EXISTS 409 so the UI can ask first.
    promoteExisting: z.boolean().optional(),
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
  /// Pass null to clear the title; pass a string to update; omit to leave alone.
  jobTitle: z.string().trim().min(1).max(80).nullable().optional(),
  /// Optional password reset by the admin. Setting null/undefined leaves
  /// the existing hash in place.
  password: z.string().min(8).max(128).optional(),
});
export type UpdateStaffBody = z.infer<typeof updateStaffBodySchema>;
