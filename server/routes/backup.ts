import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import type { ApiEnvelope, BackupPreviewDto } from '../../shared/api-types.js';
import { toHongKongDate } from '../../shared/dates.js';
import type { AppConfig } from '../config.js';
import type { DbPool } from '../db/pool.js';
import { AppError } from '../errors.js';
import {
  BACKUP_MAX_BYTES,
  createRestorePreview,
  exportBackup,
  markTokenDownloaded,
  parseBackupBuffer,
  restoreBackup
} from '../services/backup.js';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

function readRawBody(req: Request): Buffer {
  const raw = (req as RawBodyRequest).rawBody;
  if (Buffer.isBuffer(raw) && raw.length > 0) {
    return raw;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }
  throw new AppError(400, 'EMPTY_BACKUP', '備份檔是空的');
}

function requireStringField(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AppError(400, 'INVALID_RESTORE_REQUEST', `缺少 ${name}`);
  }
  return value;
}

export function createBackupRouter(pool: DbPool, config: AppConfig): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: BACKUP_MAX_BYTES, files: 1, fields: 6 }
  });

  const uploadSingle: RequestHandler = (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      if ((error as { code?: string }).code === 'LIMIT_FILE_SIZE') {
        next(new AppError(413, 'BACKUP_TOO_LARGE', '備份檔不可超過 20MB'));
        return;
      }
      next(new AppError(400, 'INVALID_MULTIPART', '無法讀取還原上傳內容'));
    });
  };

  router.post('/preview', async (req, res) => {
    const raw = readRawBody(req);
    const preview = await createRestorePreview(pool, req.sessionID, raw);
    const body: ApiEnvelope<BackupPreviewDto> = {
      data: preview,
      meta: {
        workspaceEpoch: preview.workspaceEpoch,
        revision: preview.revision,
        today: toHongKongDate(),
        now: new Date().toISOString()
      }
    };
    res.status(201).json(body);
  });

  router.get('/export', async (req, res) => {
    const value = req.query.restoreToken;
    if (value !== undefined && typeof value !== 'string') {
      throw new AppError(400, 'INVALID_RESTORE_TOKEN', '還原預覽 token 格式不正確');
    }
    const result = await exportBackup(pool, req.sessionID, value);
    const serialized = JSON.stringify(result.payload);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    if (result.tokenId) {
      res.on('finish', () => {
        void markTokenDownloaded(pool, result.tokenId as string, result.revision).catch((error) => {
          console.error('failed to mark restore token downloaded', error);
        });
      });
    }

    res.send(serialized);
  });

  router.post('/restore', uploadSingle, async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new AppError(400, 'MISSING_BACKUP_FILE', '請選擇備份檔');
    }
    const token = requireStringField(req.body?.token, 'token');
    const confirmText = requireStringField(req.body?.confirmText, '確認文字');
    const password = requireStringField(req.body?.password, '密碼');

    // Re-parse before doing any write; the service repeats validation inside
    // the locked transaction and verifies the byte hash against the preview.
    parseBackupBuffer(file.buffer);
    const result = await restoreBackup(pool, config, req.sessionID, file.buffer, token, confirmText, password);

    await new Promise<void>((resolve) => {
      req.session.destroy(() => resolve());
    });
    res.clearCookie(config.sessionCookieName, { path: '/' });
    res.json({
      data: {
        restored: true,
        requiresLogin: true,
        counts: result.counts,
        revision: result.revision,
        workspaceEpoch: result.dataEpoch
      }
    });
  });

  return router;
}