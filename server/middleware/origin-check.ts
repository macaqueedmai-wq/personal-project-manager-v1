import type { RequestHandler } from 'express';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rejects state-changing requests that do not originate from PUBLIC_ORIGIN. */
export function originCheck(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.get('origin');

    if (!origin) {
      next(new AppError(403, 'ORIGIN_REQUIRED', '缺少請求來源'));
      return;
    }

    let normalized: string;
    try {
      normalized = new URL(origin).origin;
    } catch {
      next(new AppError(403, 'ORIGIN_MISMATCH', '請求來源不符'));
      return;
    }

    if (normalized !== config.publicOrigin) {
      next(new AppError(403, 'ORIGIN_MISMATCH', '請求來源不符'));
      return;
    }

    next();
  };
}
