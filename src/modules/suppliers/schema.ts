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

/**
 * What a supplier may change about themselves, unassisted.
 *
 * This endpoint previously accepted the supplier's legal name, registration
 * number, tax ID, factory address and business-licence URL — every identity
 * and compliance field on the record — with no review. No UI exposed it, but
 * the route was live to any authenticated supplier.
 *
 * The tiering below follows standard vendor-management practice:
 *
 *  - **Self-serve (here).** Operational contact details. Getting these wrong
 *    only inconveniences the supplier, and forcing a support ticket to fix a
 *    mistyped phone number is friction with no upside.
 *
 *  - **Reviewed change request** (via the supplier desk, not this endpoint):
 *    legal name, registration number, tax ID, country, category, factory
 *    address, business licence. These appear on the signed agreement, decide
 *    which audit template applies, and define the facility-visit scope — a
 *    silent change between an audit and a signature invalidates both.
 *
 *  - **Never self-serve, dual control:** bank/payout details. Supplier
 *    payment-redirection is the classic invoice-fraud vector, and the
 *    standard control is a change request verified out-of-band against a
 *    known-good contact, approved by someone other than the requester.
 *    (Not reachable here — kept off this schema deliberately.)
 */
export const updateSupplierBodySchema = z
  .object({
    contactName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .strict();
export type UpdateSupplierBody = z.infer<typeof updateSupplierBodySchema>;
