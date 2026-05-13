import { z } from 'zod';

/// Tracker #46 — input validators for admin CRUD on payment methods.

export const paymentMethodCodes = [
  'CARD',
  'MOBILE_MONEY',
  'BANK_TRANSFER',
  'USSD',
  'CRYPTO',
  'PAY_ON_DELIVERY',
] as const;
export const paymentMethodCodeSchema = z.enum(paymentMethodCodes);

export const upsertPaymentMethodSchema = z.object({
  label: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  icon: z.string().trim().min(1).max(40),
  isActive: z.boolean(),
  isPopular: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  /// Each method type has its own shape — validated lightly here, the
  /// service layer normalises and stores it as-is.
  details: z.record(z.unknown()).default({}),
});
export type UpsertPaymentMethodBody = z.infer<typeof upsertPaymentMethodSchema>;

export const upsertBankAccountSchema = z.object({
  bankName: z.string().trim().min(1).max(80),
  accountName: z.string().trim().min(1).max(120),
  accountNumber: z.string().trim().min(1).max(40),
  currency: z.string().trim().length(3).toUpperCase(),
  country: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .nullish()
    .transform((v) => v ?? null),
  instructions: z.string().trim().max(500).nullish().transform((v) => v ?? null),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});
export type UpsertBankAccountBody = z.infer<typeof upsertBankAccountSchema>;
