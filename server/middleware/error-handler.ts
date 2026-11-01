import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, zodFieldErrors } from '../errors.js';

export const requestContext: RequestHandler = (_req, res, next) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
};

export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: '找不到這個 API' }
  });
};

export interface ErrorLogger {
  error: (...args: unknown[]) => void;
}

export function createErrorHandler(logger: ErrorLogger = console): ErrorRequestHandler {
  return (error, req, res, _next) => {
    if (res.headersSent) {
      return;
    }

    const requestId = typeof res.locals.requestId === 'string' ? res.locals.requestId : 'unknown';

    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
        }
      });
      return;
    }

    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '輸入格式有誤',
          fieldErrors: zodFieldErrors(error)
        }
      });
      return;
    }

    const type = (error as { type?: string }).type;

    if (type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'INVALID_JSON', message: '請求內容不是有效的 JSON' }
      });
      return;
    }

    if (type === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: '請求內容過大' }
      });
      return;
    }

    logger.error(
      `[${requestId}] ${req.method} ${req.path} 未預期錯誤：${
        error instanceof Error ? error.message : String(error)
      }`
    );

    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '伺服器發生錯誤，請稍後再試' }
    });
  };
}
