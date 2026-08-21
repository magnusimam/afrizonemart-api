import type { CookieOptions, Request, Response } from 'express';
import { env, isProduction } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import type { AuthedRequest } from '@/middleware/auth';
import { z } from 'zod';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  updateMeBodySchema,
} from './auth.schema';
import {
  getMe,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  resetPassword,
  updateMe,
} from './service';
import { createGoogleChallenge, signInWithGoogle } from './google.service';
import {
  startPhoneVerification,
  verifyPhoneAndSignIn,
} from './phone.service';
import { deleteOwnAccount } from './delete-account.service';

const REFRESH_COOKIE = 'azm_refresh';

/**
 * Parent domain the refresh cookie is scoped to, derived from WEB_URL.
 *
 * Derived rather than hardcoded so a staging deploy on another domain keeps
 * working. Returns null for a bare host or an IP, where a domain attribute
 * would be invalid and host-only is correct anyway.
 */
const COOKIE_DOMAIN = (() => {
  try {
    const host = new URL(env.WEB_URL).hostname;
    if (/^[\d.]+$/.test(host) || !host.includes('.')) return null;
    const parts = host.split('.');
    // eTLD+1 for the common cases: example.com, example.co.uk.
    const base = parts.slice(-(parts.length >= 3 && parts.at(-2)!.length <= 3 ? 3 : 2));
    return `.${base.join('.')}`;
  } catch {
    return null;
  }
})();

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    // `none` made this a third-party cookie, and Safari blocks those by
    // default. The effect was invisible and expensive: a supplier signed in
    // fine (the access token comes back in the body and lives in memory), and
    // then everything they typed after the token expired 15 minutes later
    // silently stopped saving, because the refresh call had no cookie to send.
    // Long forms on an iPad were the worst case.
    //
    // afrizonemart.com and api.afrizonemart.com share a registrable domain, so
    // these requests were same-site all along. Scoping the cookie to the parent
    // domain makes that explicit and takes it out of third-party territory.
    sameSite: 'lax',
    ...(isProduction && COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    // Phase 11.3 (audit M8): widened from `/api/auth` to `/api`. The
    // narrower path was fragile — a future endpoint outside `/api/auth`
    // that wants to read or rotate the refresh cookie would silently
    // get nothing back from the browser, and the bug wouldn't surface
    // until production. `/api` keeps the cookie scoped to our API
    // surface (browsers don't send it to `/`, `/static/*`, etc.) while
    // making it available to every API route that legitimately needs
    // it. Only `/api/auth/refresh` reads it today; the wider scope is
    // future-proofing without expanding blast radius.
    path: '/api',
    // Mirror JWT_REFRESH_EXPIRES_IN. We can't parse "30d" trivially; hard-cap
    // at 60 days which is generous and still bounded.
    maxAge: 60 * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: 0 });
}

interface AuthApiResponse {
  user: unknown;
  accessToken: string;
}

function buildResponse(result: { user: unknown; accessToken: string }): AuthApiResponse {
  return { user: result.user, accessToken: result.accessToken };
}

export async function registerHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = registerBodySchema.parse(req.body);
  const result = await register(body);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json(buildResponse(result));
}

export async function loginHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = loginBodySchema.parse(req.body);
  const result = await login(body);
  setRefreshCookie(res, result.refreshToken);
  res.json(buildResponse(result));
}

export async function refreshHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const cookieToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!cookieToken) {
    throw HttpError.unauthorized('Missing refresh token');
  }
  const result = await refresh(cookieToken);
  setRefreshCookie(res, result.refreshToken);
  res.json(buildResponse(result));
}

export async function meHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const user = await getMe(req.user.id);
  res.json(user);
}

export async function updateMeHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = updateMeBodySchema.parse(req.body);
  const user = await updateMe(req.user.id, body);
  res.json(user);
}

/// DELETE /api/auth/me — in-app account deletion.
///
/// Required by Google Play (mid-2024 policy: every app with auth
/// must offer in-app delete). Wipes refresh cookie + access token
/// effectively so the next request from the client falls through
/// to the signed-out path.
const deleteMeBodySchema = z.object({
  confirmation: z.string().min(1).max(120),
  reason: z.string().max(500).optional().nullable(),
});

export async function deleteMeHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = deleteMeBodySchema.parse(req.body);
  await deleteOwnAccount({
    userId: req.user.id,
    confirmation: body.confirmation,
    reason: body.reason ?? null,
  });
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function logoutHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  await logout(req.user.id);
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function forgotPasswordHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = forgotPasswordBodySchema.parse(req.body);
  // Fire-and-forget from the client's POV — always return 204 so attackers
  // can't enumerate accounts based on response shape or timing skew.
  await requestPasswordReset(body);
  res.status(204).end();
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = resetPasswordBodySchema.parse(req.body);
  await resetPassword(body);
  res.status(204).end();
}

const googleBody = z.object({
  idToken: z.string().min(1),
  // Phase 11.3 (audit H7): the single-use nonce the client requested
  // from /api/auth/google/challenge before triggering GIS.
  nonce: z.string().min(16).max(128),
});

export async function googleSignInHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { idToken, nonce } = googleBody.parse(req.body);
  const result = await signInWithGoogle(idToken, nonce);
  setRefreshCookie(res, result.refreshToken);
  res.json(buildResponse(result));
}

export async function googleChallengeHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json(await createGoogleChallenge());
}

const phoneStartBody = z.object({ phone: z.string().min(8).max(20) });

export async function phoneStartHandler(req: Request, res: Response): Promise<void> {
  const { phone } = phoneStartBody.parse(req.body);
  const r = await startPhoneVerification(phone);
  res.json(r);
}

const phoneVerifyBody = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().min(4).max(8),
});

export async function phoneVerifyHandler(req: Request, res: Response): Promise<void> {
  const body = phoneVerifyBody.parse(req.body);
  const result = await verifyPhoneAndSignIn(body.phone, body.code);
  setRefreshCookie(res, result.refreshToken);
  res.json(buildResponse(result));
}

