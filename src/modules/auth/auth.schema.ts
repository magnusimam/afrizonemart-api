import { z } from 'zod';

/**
 * Reusable email field — trims + lowercases BEFORE validating the
 * email format so a user with a leading space (browser autofill,
 * copy-paste) doesn't trip "Invalid email".
 */
const emailField = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().email());

export const registerBodySchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  name: z.string().trim().min(1).max(100).optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailField,
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const forgotPasswordBodySchema = z.object({
  email: emailField,
});
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;

export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;

