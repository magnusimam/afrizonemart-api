import type { CookieOptions, Request, Response } from 'express';
import { isProduction } from '@/config/env';
import { HttpError } from '@/middleware/error-handler';
import type { AuthedRequest } from '@/middleware/auth';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from './auth.schema';
import {
  getMe,
  login,
  logout,
  refresh,
  register,
  requestPasswordReset,
  resetPassword,
} from './service';

const REFRESH_COOKIE = 'azm_refresh';

function refreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
    // Mirror JWT_REFRESH_EXPIRES_IN. We can't parse "30d" trivially; hard-cap
    // at 60 days which is generous and still bounded.
    maxAge: 60 * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
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

