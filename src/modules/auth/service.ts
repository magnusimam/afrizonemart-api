import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { env } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import { eventBus } from '@/infra/eventBus';
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
  role: string;
  createdAt: string;
}

function toPublic(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
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
  });

  await eventBus.emit('user.registered', {
    userId: user.id,
    email: user.email,
  });

  return issueTokens(user);
}

export async function login(body: LoginBody): Promise<AuthResult> {
  const user = await findUserByEmail(body.email);
  if (!user) {
    throw HttpError.unauthorized('Invalid email or password');
  }

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    throw HttpError.unauthorized('Invalid email or password');
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
