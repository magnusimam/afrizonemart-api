import type { Request, Response } from 'express';
import { Router } from 'express';
import { env } from '@/config/env';
import { asyncHandler } from '@/middleware/async-handler';

/**
 * Mobile app version gate.
 *
 * Single GET endpoint the mobile app pings on launch. Returns per-
 * platform minimum and force-update versions, plus an optional
 * message to show in the upgrade modal.
 *
 * Reads from env so ops can roll a force-update without a code
 * deploy:
 *
 *   railway variables --set "ANDROID_FORCE_VERSION=1.2.0"
 *
 * → next mobile launch picks it up; clients below 1.2.0 see the
 * blocking screen with a "Update now" button.
 *
 * Per-platform store URLs are included in the response so the
 * mobile client doesn't have to hardcode them — change a store
 * listing once we have one without rebuilding the client.
 */

export interface VersionGateResponse {
  ios: {
    minVersion: string;
    forceVersion: string;
    storeUrl: string;
  };
  android: {
    minVersion: string;
    forceVersion: string;
    storeUrl: string;
  };
  /// Optional message — when set, replaces the mobile client's
  /// default "please update to continue" copy on the force-update
  /// screen. Used for incident-specific messaging.
  message: string | null;
}

const IOS_STORE_URL =
  'https://apps.apple.com/app/afrizonemart/id000000000';
const ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.afrizonemart.app';

export const appRoutes = Router();

appRoutes.get(
  '/version-gate',
  asyncHandler(async (_req: Request, res: Response) => {
    const body: VersionGateResponse = {
      ios: {
        minVersion: env.IOS_MIN_VERSION,
        forceVersion: env.IOS_FORCE_VERSION,
        storeUrl: IOS_STORE_URL,
      },
      android: {
        minVersion: env.ANDROID_MIN_VERSION,
        forceVersion: env.ANDROID_FORCE_VERSION,
        storeUrl: ANDROID_STORE_URL,
      },
      message: env.APP_UPGRADE_MESSAGE ?? null,
    };
    /// Short cache so clients can poll without hammering us, but
    /// short enough that a real emergency rolls out within a minute.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(body);
  }),
);
