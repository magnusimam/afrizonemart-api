import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt';
import {
  createUser,
  findUserByEmail,
  findUserById,
  setRefreshTokenHash,
} from './repository';
import type {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
  UpdateMeBody,
} from './auth.schema';

const BCRYPT_ROUNDS = 12;

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  /// E.164 phone, when the user has one (set via phone-OTP signup
  /// or /account/profile). Null otherwise.
  phone: string | null;
  /// Avatar URL, typically populated by Google sign-in.
  avatarUrl: string | null;
  role: string;
  jobTitle: string | null;
  /// Effective capability set the user has right now. Computed once at
  /// login time so the frontend can filter the sidebar without a
  /// follow-up call. ADMIN gets every capability; STAFF gets whatever
  /// the admin granted them via /admin/staff; SELLER/CUSTOMER get the
  /// role defaults.
  permissions: string[];
  /// Tracker #48 — marketing consent flags. Surfaced to the
  /// storefront so the profile toggles render the current state +
  /// the auth store has them available for any client-side gating.
  marketingOptIn: boolean;
  smsOptIn: boolean;
  /// 2026-05-16 Phase 2 — ISO yyyy-mm-dd (UTC) or null.
  birthDate: string | null;
  createdAt: string;
}

function toPublic(user: User): PublicUser {
  // Inline the resolution so we don't need to import the registry just
  // for a few lines (and avoid any TS narrowing trouble with the
  // `role as StaffRole` cast).
  let permissions: string[] = [];
  if (user.role === 'ADMIN') {
    // Lazy import — safe inside a function body — to keep the auth
    // module's static import graph small.
    permissions = require('@/lib/permissions').ALL_CAPABILITIES;
  } else if (user.role === 'STAFF') {
    permissions = (user.permissions ?? []).filter(Boolean);
  } else if (user.role === 'SELLER') {
    permissions = ['orders.read', 'products.read', 'products.write', 'uploads.write'];
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role,
    jobTitle: user.jobTitle ?? null,
    permissions,
    marketingOptIn: user.marketingOptIn,
    smsOptIn: user.smsOptIn,
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokens(user: User): Promise<AuthResult> {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  await setRefreshTokenHash(user.id, refreshTokenHash);

  return { user: toPublic(user), accessToken, refreshToken };
}

export async function register(body: RegisterBody): Promise<AuthResult> {
  const existing = await findUserByEmail(body.email);
  if (existing) {
    throw HttpError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const user = await createUser({
    email: body.email,
    passwordHash,
    name: body.name,
    marketingOptIn: body.marketingOptIn,
    smsOptIn: body.smsOptIn,
  });

  await eventBus.emit('user.registered', {
    userId: user.id,
    email: user.email,
  });

  return issueTokens(user);
}

/// Phase 11.3 (audit M7) — lockout policy. 5 wrong passwords inside
/// a 15-minute rolling window flips the account into a 15-minute
/// soft-lock. The window resets on the next failure outside the
/// window, and the whole counter resets on a successful login.
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_THRESHOLD = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;

export async function login(body: LoginBody): Promise<AuthResult> {
  const user = await findUserByEmail(body.email);
  if (!user) {
    throw HttpError.unauthorized('Invalid email or password');
  }

  // Phase 11.3 (audit M7): check the lockout BEFORE bcrypt-comparing.
  // Defends against IP-rotating credential stuffing — the global
  // rate-limiter is keyed on IP, so a botnet hitting one account from
  // many addresses bypasses it. Per-account counter catches that.
  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    throw HttpError.unauthorized(
      `Account temporarily locked due to too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    // Roll the failure counter. Reset to 1 if the last failure was
    // outside the 15-min window — otherwise increment.
    const withinWindow =
      user.lastFailedLoginAt !== null &&
      now.getTime() - user.lastFailedLoginAt.getTime() < LOGIN_FAIL_WINDOW_MS;
    const newCount = withinWindow ? user.failedLoginAttempts + 1 : 1;
    const newLockUntil =
      newCount >= LOGIN_FAIL_THRESHOLD
        ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
        : null;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newCount,
        lastFailedLoginAt: now,
        lockedUntil: newLockUntil,
      },
    });
    if (newLockUntil) {
      logger.warn('auth.login.account_locked', {
        userId: user.id,
        attempts: newCount,
        lockedUntil: newLockUntil.toISOString(),
      });
    }
    throw HttpError.unauthorized('Invalid email or password');
  }

  // Successful login — clear the counter so a few off-by-one typos
  // earlier in the day don't accumulate into a lock for someone who
  // ultimately remembered their password.
  if (user.failedLoginAttempts > 0 || user.lockedUntil !== null) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
    });
  }

  await eventBus.emit('user.logged_in', {
    userId: user.id,
    email: user.email,
  });

  return issueTokens(user);
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw HttpError.unauthorized('Invalid or expired refresh token');
  }

  const user = await findUserById(payload.sub);
  if (!user || !user.refreshTokenHash) {
    throw HttpError.unauthorized('Session no longer valid');
  }

  const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!matches) {
    // Token doesn't match what's on file — possibly a stolen-token replay.
    // Clear the stored hash so all sessions for this user are revoked.
    await setRefreshTokenHash(user.id, null);
    throw HttpError.unauthorized('Session no longer valid');
  }

  return issueTokens(user);
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw HttpError.notFound('User not found');
  }
  return toPublic(user);
}

/**
 * Update the signed-in user's mutable profile fields. Returns the
 * fresh `PublicUser` shape so the storefront can refresh its auth
 * store atomically. Throws if the user no longer exists or — for
 * phone — if the value is already taken by another account
 * (defends against a phone-number collision after a phone-OTP
 * sign-up race).
 */
export async function updateMe(
  userId: string,
  body: UpdateMeBody,
): Promise<PublicUser> {
  if (Object.keys(body).length === 0) {
    // Nothing to update; treat as a no-op. Return the current row.
    return getMe(userId);
  }

  // Phone uniqueness pre-check — Prisma's @unique would throw P2002
  // anyway, but a friendly message is better than a 500.
  if (body.phone) {
    const existing = await prisma.user.findUnique({
      where: { phone: body.phone },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      throw HttpError.conflict('That phone number is already in use.');
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.marketingOptIn !== undefined && { marketingOptIn: body.marketingOptIn }),
      ...(body.smsOptIn !== undefined && { smsOptIn: body.smsOptIn }),
      ...(body.birthDate !== undefined && {
        birthDate: body.birthDate
          ? new Date(`${body.birthDate}T00:00:00.000Z`)
          : null,
      }),
    },
  });

  return toPublic(updated);
}

export async function logout(userId: string): Promise<void> {
  await setRefreshTokenHash(userId, null);
}

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MIN = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a one-time reset token. Always returns success to the caller —
 * we never reveal whether an email exists, to keep the endpoint safe to
 * probe. The actual email goes out via the notifications dispatcher.
 */
export async function requestPasswordReset(
  body: ForgotPasswordBody,
): Promise<void> {
  const user = await findUserByEmail(body.email);
  if (!user) return;

  // Best-effort cleanup of expired or already-used tokens for this user.
  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date() } }],
    },
  });

  const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MIN * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const resetUrl = `${env.WEB_URL}/reset-password?token=${token}`;
  await eventBus.emit('password.reset_requested', {
    userId: user.id,
    email: user.email,
    resetUrl,
    expiresInMinutes: RESET_TOKEN_EXPIRY_MIN,
  });
}

export async function resetPassword(body: ResetPasswordBody): Promise<void> {
  const tokenHash = hashToken(body.token);
  const record = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!record) {
    throw HttpError.badRequest(
      'This password reset link is invalid or has expired. Request a new one.',
    );
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, refreshTokenHash: null },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Revoke any other outstanding tokens for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);
}
