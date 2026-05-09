import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
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

let cachedClient: OAuth2Client | null = null;
function client(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID) {
    throw HttpError.badRequest(
      'Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the API.',
    );
  }
  if (!cachedClient) cachedClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return cachedClient;
}

export interface GoogleSignInResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/// Phase 11.3 (audit H7): TTL for Google sign-in challenge. Long
/// enough that a slow user finishing the One Tap flow doesn't hit
/// expiry; short enough that captured challenges age out fast.
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface GoogleChallenge {
  nonce: string;
  expiresAt: string;
}

/**
 * Phase 11.3 (audit H7) — issue a single-use OIDC nonce for the next
 * Google sign-in attempt. The client passes this value to GIS via
 * `google.accounts.id.initialize({ nonce })` so Google embeds it in
 * the ID token; verifyIdToken then enforces the round-trip + a
 * single-use consume against this row.
 */
export async function createGoogleChallenge(): Promise<GoogleChallenge> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw HttpError.badRequest(
      'Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the API.',
    );
  }
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await prisma.googleAuthChallenge.create({
    data: { nonce, expiresAt },
  });
  return { nonce, expiresAt: expiresAt.toISOString() };
}

/**
 * Verifies a Google ID token, finds-or-creates the user, and issues our
 * own JWT pair. Three flows:
 *
 *  1. User has googleId match → log them in.
 *  2. User has matching email but no googleId → link the Google account
 *     to the existing record (returning user who normally signs in with
 *     password).
 *  3. No user → create a new CUSTOMER row with a random password (they
 *     can never password-login until they "set a password" from
 *     account settings, but Google sign-in always works).
 *
 * Throws on token verification failure, missing email, or unverified
 * email.
 */
export async function signInWithGoogle(
  idToken: string,
  nonce: string,
): Promise<GoogleSignInResult> {
  if (!idToken) throw HttpError.badRequest('Missing Google ID token.');
  if (!nonce) throw HttpError.badRequest('Missing Google sign-in challenge.');

  // Phase 11.3 (audit H7): atomic single-use consume of the
  // server-issued challenge. `updateMany` with the unconsumed +
  // unexpired predicate guarantees only one caller wins; a second
  // request with the same nonce gets count=0 and is rejected. This
  // is what makes a captured ID token unreplayable — the nonce row
  // is gone the moment the first verify completes.
  const consume = await prisma.googleAuthChallenge.updateMany({
    where: {
      nonce,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (consume.count !== 1) {
    logger.warn('auth.google.challenge_invalid', { nonce });
    throw HttpError.unauthorized('Google sign-in challenge is invalid or expired.');
  }

  let ticket;
  try {
    ticket = await client().verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID!,
    });
  } catch (err) {
    logger.warn('auth.google.verify_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw HttpError.unauthorized('Invalid Google token.');
  }

  const payload = ticket.getPayload();
  if (!payload) throw HttpError.unauthorized('Empty Google token payload.');
  if (!payload.email_verified) {
    throw HttpError.unauthorized('Google email is not verified.');
  }
  // Phase 11.3 (audit H7): nonce + azp checks. `nonce` ties the ID
  // token to the challenge we just consumed; `azp` (authorized party,
  // OIDC §2) ensures the token was minted for our own client_id —
  // defends against a different Google project's token being replayed
  // here even when both share an `aud`.
  if (payload.nonce !== nonce) {
    logger.warn('auth.google.nonce_mismatch');
    throw HttpError.unauthorized('Google token nonce mismatch.');
  }
  if (payload.azp && payload.azp !== env.GOOGLE_CLIENT_ID) {
    logger.warn('auth.google.azp_mismatch', { azp: payload.azp });
    throw HttpError.unauthorized('Google token authorized party mismatch.');
  }
  const email = payload.email?.toLowerCase().trim();
  const sub = payload.sub;
  if (!email || !sub) {
    throw HttpError.unauthorized('Google token missing required claims.');
  }

  // 1) Match by googleId
  let user = await prisma.user.findUnique({ where: { googleId: sub } });

  // 2) Match by email — link the Google account
  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      user = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          googleId: sub,
          ...(payload.picture && !byEmail.avatarUrl
            ? { avatarUrl: payload.picture }
            : {}),
          ...(payload.name && !byEmail.name ? { name: payload.name } : {}),
        },
      });
      logger.info('auth.google.linked_existing', { userId: user.id });
    }
  }

  // 3) Create new
  let isNewUser = false;
  if (!user) {
    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, BCRYPT_ROUNDS);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
        googleId: sub,
      },
    });
    isNewUser = true;
    logger.info('auth.google.created', { userId: user.id, email });
  }

  // Emit user.registered for first-time sign-ins so welcome email fires.
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
  // Mirror service.ts: surface effective capabilities so SSO + phone
  // logins return the same shape as email/password login.
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
    createdAt: user.createdAt.toISOString(),
  };
}
