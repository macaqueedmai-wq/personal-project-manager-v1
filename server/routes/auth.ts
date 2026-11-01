import { Router } from 'express';
import type { ApiEnvelope, SessionDto } from '../../shared/api-types.js';
import { APP_TIMEZONE, toHongKongDate } from '../../shared/dates.js';
import { loginSchema } from '../../shared/schemas.js';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  fingerprintPasswordHash,
  generateSessionToken,
  LoginRateLimiter,
  verifyPassword
} from '../services/auth.js';
import { destroySession, regenerateSession, saveSession } from '../services/session.js';

export interface AuthRouterDeps {
  config: AppConfig;
  pool: DbPool;
  limiter: LoginRateLimiter;
}

function unauthenticatedSession(reason?: 'expired'): SessionDto {
  return {
    authenticated: false,
    csrfToken: null,
    workspaceEpoch: null,
    today: null,
    now: null,
    timezone: APP_TIMEZONE,
    ...(reason ? { reason } : {})
  };
}

export function createAuthRouter({ config, pool, limiter }: AuthRouterDeps): Router {
  const router = Router();

  router.get('/session', async (req, res) => {
    const state = await readWorkspaceState(pool);
    const session = req.session;

    if (!session.authenticated) {
      const body: ApiEnvelope<SessionDto> = { data: unauthenticatedSession() };
      res.json(body);
      return;
    }

    const credentialChanged =
      session.credentialFingerprint !== fingerprintPasswordHash(config.adminPasswordHash);
    const epochChanged = session.dataEpoch !== state.dataEpoch;

    if (credentialChanged || epochChanged) {
      await destroySession(req).catch(() => undefined);
      const body: ApiEnvelope<SessionDto> = { data: unauthenticatedSession('expired') };
      res.json(body);
      return;
    }

    if (!session.csrfToken) {
      session.csrfToken = generateSessionToken();
      await saveSession(req);
    }

    const body: ApiEnvelope<SessionDto> = {
      data: {
        authenticated: true,
        csrfToken: session.csrfToken,
        workspaceEpoch: state.dataEpoch,
        today: toHongKongDate(),
        now: new Date().toISOString(),
        timezone: APP_TIMEZONE
      }
    };
    res.json(body);
  });

  router.post('/login', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    const decision = limiter.check(ip);

    if (decision.blocked) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', '嘗試次數過多，請稍後再試');
    }

    const input = parseOrThrow(loginSchema, req.body);
    const passwordMatches = await verifyPassword(input.password, config.adminPasswordHash);

    if (!passwordMatches) {
      limiter.recordFailure(ip);
      throw new AppError(401, 'INVALID_CREDENTIALS', '密碼不正確');
    }

    limiter.reset(ip);
    const state = await readWorkspaceState(pool);

    await regenerateSession(req);
    req.session.authenticated = true;
    req.session.credentialFingerprint = fingerprintPasswordHash(config.adminPasswordHash);
    req.session.dataEpoch = state.dataEpoch;
    req.session.csrfToken = generateSessionToken();
    await saveSession(req);

    const body: ApiEnvelope<SessionDto> = {
      data: {
        authenticated: true,
        csrfToken: req.session.csrfToken,
        workspaceEpoch: state.dataEpoch,
        today: toHongKongDate(),
        now: new Date().toISOString(),
        timezone: APP_TIMEZONE
      }
    };
    res.json(body);
  });

  router.post(
    '/logout',
    requireAuth(pool, config),
    requireCsrf,
    async (req, res) => {
      await destroySession(req);
      res.clearCookie(config.sessionCookieName, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.nodeEnv === 'production'
      });
      res.json({ data: { ok: true } });
    }
  );

  return router;
}
