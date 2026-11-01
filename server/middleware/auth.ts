import type { RequestHandler } from 'express';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError } from '../errors.js';
import { fingerprintPasswordHash } from '../services/auth.js';
import { destroySession } from '../services/session.js';

/**
 * Every authenticated request re-checks the credential fingerprint and the
 * workspace data epoch stored in the session, so a password change or a future
 * restore invalidates old sessions immediately.
 */
export function requireAuth(pool: DbPool, config: AppConfig): RequestHandler {
  return async (req, _res, next) => {
    try {
      const session = req.session;

      if (!session.authenticated) {
        throw new AppError(401, 'UNAUTHENTICATED', '請先登入');
      }

      if (session.credentialFingerprint !== fingerprintPasswordHash(config.adminPasswordHash)) {
        await destroySession(req).catch(() => undefined);
        throw new AppError(401, 'SESSION_EXPIRED', '登入已失效，請重新登入');
      }

      const state = await readWorkspaceState(pool);

      if (session.dataEpoch !== state.dataEpoch) {
        await destroySession(req).catch(() => undefined);
        throw new AppError(401, 'SESSION_EXPIRED', '登入已失效，請重新登入');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
