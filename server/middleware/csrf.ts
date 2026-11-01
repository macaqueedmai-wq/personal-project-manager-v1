import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';
import { safeTokenEquals } from '../services/auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Double-submit CSRF token bound to the server session. */
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const expected = req.session.csrfToken;
  const received = req.get('x-csrf-token');

  if (!expected || !received || !safeTokenEquals(expected, received)) {
    next(new AppError(403, 'INVALID_CSRF_TOKEN', 'CSRF 驗證失敗，請重新載入頁面'));
    return;
  }

  next();
};
