import type { PaymentMethodCode, Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  UpsertBankAccountBody,
  UpsertPaymentMethodBody,
} from './schema';

/// Tracker #46 — service layer for customer-facing payment-method
/// config + bank accounts.

export interface PaymentMethodDTO {
  id: string;
  code: PaymentMethodCode;
  label: string;
  description: string;
  icon: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
  details: Record<string, unknown>;
}

export interface PublicMethodsResponse {
  methods: PaymentMethodDTO[];
  /// Bank accounts matching the customer's currency (and country, if
  /// any account is country-restricted). Empty when there's nothing
  /// matching — storefront falls back to a friendly "no account
  /// configured yet" message.
  bankAccounts: Array<{
    id: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    currency: string;
    country: string | null;
    instructions: string | null;
  }>;
}

function toDto(row: Awaited<ReturnType<typeof prisma.paymentMethodConfig.findFirst>>): PaymentMethodDTO {
  if (!row) throw new Error('toDto called with null');
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    icon: row.icon,
    isActive: row.isActive,
    isPopular: row.isPopular,
    sortOrder: row.sortOrder,
    details: (row.details as Record<string, unknown>) ?? {},
  };
}

/// Public — what the storefront /checkout/payment page reads.
export async function listPublicPaymentMethods(
  currency: string,
  country: string | null,
): Promise<PublicMethodsResponse> {
  const cur = currency.toUpperCase();
  const ctry = country?.toUpperCase() ?? null;

  const [methods, bankAccounts] = await Promise.all([
    prisma.paymentMethodConfig.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    }),
    prisma.paymentBankAccount.findMany({
      where: {
        isActive: true,
        currency: cur,
        OR: [
          { country: null },
          ...(ctry ? [{ country: ctry }] : []),
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { bankName: 'asc' }],
    }),
  ]);

  return {
    methods: methods.map(toDto),
    bankAccounts: bankAccounts.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      accountName: a.accountName,
      accountNumber: a.accountNumber,
      currency: a.currency,
      country: a.country,
      instructions: a.instructions,
    })),
  };
}

/// Admin — list every row regardless of active state.
export async function adminListPaymentMethods() {
  const rows = await prisma.paymentMethodConfig.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  return { items: rows.map(toDto) };
}

export async function adminGetPaymentMethod(id: string) {
  const row = await prisma.paymentMethodConfig.findUnique({ where: { id } });
  if (!row) throw HttpError.notFound('Payment method not found');
  return toDto(row);
}

export async function adminUpdatePaymentMethod(
  id: string,
  body: UpsertPaymentMethodBody,
) {
  const existing = await prisma.paymentMethodConfig.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Payment method not found');
  const row = await prisma.paymentMethodConfig.update({
    where: { id },
    data: {
      label: body.label,
      description: body.description,
      icon: body.icon,
      isActive: body.isActive,
      isPopular: body.isPopular,
      sortOrder: body.sortOrder,
      details: body.details as Prisma.InputJsonValue,
    },
  });
  return toDto(row);
}

export async function adminListBankAccounts() {
  const rows = await prisma.paymentBankAccount.findMany({
    orderBy: [{ sortOrder: 'asc' }, { bankName: 'asc' }],
  });
  return {
    items: rows.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      accountName: a.accountName,
      accountNumber: a.accountNumber,
      currency: a.currency,
      country: a.country,
      instructions: a.instructions,
      isActive: a.isActive,
      sortOrder: a.sortOrder,
    })),
  };
}

export async function adminCreateBankAccount(body: UpsertBankAccountBody) {
  return prisma.paymentBankAccount.create({ data: body });
}

export async function adminUpdateBankAccount(
  id: string,
  body: UpsertBankAccountBody,
) {
  const existing = await prisma.paymentBankAccount.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Bank account not found');
  return prisma.paymentBankAccount.update({ where: { id }, data: body });
}

export async function adminDeleteBankAccount(id: string) {
  await prisma.paymentBankAccount.delete({ where: { id } }).catch(() => {
    throw HttpError.notFound('Bank account not found');
  });
}
