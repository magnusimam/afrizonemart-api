import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import twilio from 'twilio';
import type { Twilio } from 'twilio';
import type { User } from '@prisma/client';
import { env } from '@/config/env';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { signAccessToken, signRefreshToken } from './jwt';
import { setRefreshTokenHash } from './repository';
import type { PublicUser } from './service';

const BCRYPT_ROUNDS = 12;

let cachedTwilio: Twilio | null = null;
function getTwilio(): Twilio {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SID) {
    throw HttpError.badRequest(
      'Phone authentication is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID on the API.',
    );
  }
  if (!cachedTwilio) {
    cachedTwilio = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return cachedTwilio;
}

/**
 * Validates and normalises a phone number into E.164 (e.g. "+2348012345678").
 * We trust libphonenumber's full validator on the frontend; the backend
 * just enforces the basic shape so Twilio doesn't bill us for nonsense.
 */
function toE164(input: string): string {
  const clean = input.trim().replace(/[\s()-]/g, '');
  if (!/^\+\d{8,15}$/.test(clean)) {
    throw HttpError.badRequest(
      'Phone number must be in E.164 format, e.g. +2348012345678.',
    );
  }
  return clean;
}

/**
 * Sends a 6-digit verification code via SMS. Twilio Verify handles the
 * actual sending, rate-limiting, and retry-window — we just call it.
 */
export async function startPhoneVerification(rawPhone: string): Promise<{ status: string }> {
  const phone = toE164(rawPhone);
  const t = getTwilio();
  const verification = await t.verify.v2
    .services(env.TWILIO_VERIFY_SID!)
    .verifications.create({ to: phone, channel: 'sms' });
  logger.info('auth.phone.verification_started', {
    phone,
    sid: verification.sid,
    status: verification.status,
  });
  return { status: verification.status };
}

export interface PhoneSignInResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * Checks the OTP, then finds-or-creates a user keyed off the phone
 * number. New users get a synthetic email (`+2348…@phone.afrizonemart.local`)
 * and a random password; they can later set a real email + password
 * from /account/settings (TODO).
 */
export async function verifyPhoneAndSignIn(
  rawPhone: string,
  code: string,
): Promise<PhoneSignInResult> {
  const phone = toE164(rawPhone);
  if (!/^\d{4,8}$/.test(code.trim())) {
    throw HttpError.badRequest('Invalid verification code.');
  }
  const t = getTwilio();
  const check = await t.verify.v2
    .services(env.TWILIO_VERIFY_SID!)
    .verificationChecks.create({ to: phone, code: code.trim() });

  if (check.status !== 'approved') {
    logger.warn('auth.phone.verify_failed', { phone, status: check.status });
    throw HttpError.unauthorized('Verification failed. Code is wrong or expired.');
  }

  // Find or create
  let user = await prisma.user.findUnique({ where: { phone } });
  let isNewUser = false;

  if (!user) {
    // Synthetic email so we can keep our `email NOT NULL UNIQUE` invariant
    // until we re-architect Auth to allow phone-only accounts natively.
    const syntheticEmail = `phone${phone.replace('+', '')}@phone.afrizonemart.local`;
    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);
    user = await prisma.user.create({
      data: {
        email: syntheticEmail,
        phone,
        passwordHash,
      },
    });
    isNewUser = true;
    logger.info('auth.phone.created', { userId: user.id, phone });
  }

  if (isNewUser) {
    await eventBus.emit('user.registered', {
      userId: user.id,
      email: user.email,
    });
  } else {
    await eventBus.emit('user.logged_in', {
      userId: user.id,
      email: user.email,
    });
  }

  const tokens = await issueTokens(user);
  return { user: toPublic(user), ...tokens };
}

async function issueTokens(user: User) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  await setRefreshTokenHash(user.id, refreshTokenHash);
  return { accessToken, refreshToken };
}

function toPublic(user: User): PublicUser {
  let permissions: string[] = [];
  if (user.role === 'ADMIN') {
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
