import { z } from 'zod';

/**
 * Supplier portal — request validation.
 *
 * `apply` is the combined "register + apply" entry: a brand-new maker
 * supplies email + password (account is created), an existing AZM user is
 * already authenticated (account fields ignored). Either way a
 * SupplierProfile is created and they land at Stage 1.
 */

const STRONG_PASSWORD_MESSAGE =
  'Password must include a number, a symbol, or an uppercase letter.';

// Mirrors the auth module's password rule so accounts created via /apply
// meet the same floor as accounts created via /api/auth/register.
const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .refine(
    (v) => /[0-9]/.test(v) || /[A-Z]/.test(v) || /[^A-Za-z0-9]/.test(v),
    { message: STRONG_PASSWORD_MESSAGE },
  );

export const applyBodySchema = z
  .object({
    // Account fields — only required when the caller is NOT authenticated.
    email: z
      .string()
      .transform((s) => s.trim().toLowerCase())
      .pipe(z.string().email())
      .optional(),
    password: passwordField.optional(),
    name: z.string().trim().min(1).max(100).optional(),

    // Supplier profile (Expression of Interest basics).
    companyName: z.string().trim().min(1).max(200),
    contactName: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    country: z.string().trim().min(1).max(80),
    region: z.string().trim().max(80).optional(),
    category: z.string().trim().min(1).max(80),
  })
  .strict();
export type ApplyBody = z.infer<typeof applyBodySchema>;

export const createPIQBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: z.string().trim().max(80).optional(),
  })
  .strict();
export type CreatePIQBody = z.infer<typeof createPIQBodySchema>;

export const updatePIQBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().max(80).optional(),
    answers: z.record(z.unknown()).optional(),
    completion: z.coerce.number().int().min(0).max(100).optional(),
  })
  .strict();
export type UpdatePIQBody = z.infer<typeof updatePIQBodySchema>;

export const updateSupplierBodySchema = z
  .object({
    companyName: z.string().trim().min(1).max(200).optional(),
    contactName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    country: z.string().trim().min(1).max(80).optional(),
    region: z.string().trim().max(80).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    legalName: z.string().trim().max(200).optional(),
    regNumber: z.string().trim().max(120).optional(),
    taxId: z.string().trim().max(120).optional(),
    yearEstablished: z.coerce.number().int().min(1800).max(2100).optional(),
    employees: z.coerce.number().int().min(0).max(1_000_000).optional(),
    factoryType: z.string().trim().max(120).optional(),
    factoryAddress: z.string().trim().max(500).optional(),
    businessLicenseUrl: z.string().url().max(1024).optional(),
  })
  .strict();
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;
