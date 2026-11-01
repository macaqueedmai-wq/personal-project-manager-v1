import type { Request } from 'express';
import type { ResponseMeta } from '../../shared/api-types.js';
import { toHongKongDate } from '../../shared/dates.js';
import { uuidSchema } from '../../shared/schemas.js';
import { AppError } from '../errors.js';

export function readWorkspaceEpoch(req: Request): string {
  const header = req.get('x-workspace-epoch');
  if (!header) {
    throw new AppError(400, 'MISSING_WORKSPACE_EPOCH', '缺少工作區版本，請重新載入頁面');
  }
  if (!uuidSchema.safeParse(header).success) {
    throw new AppError(409, 'WORKSPACE_CHANGED', '資料已更新，請重新載入頁面');
  }
  return header;
}

export function assertUuidParam(value: string): string {
  if (!uuidSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_ID', '識別碼格式不正確');
  }
  return value;
}

export function buildMeta(
  state: { revision: string; dataEpoch: string },
  total?: number
): ResponseMeta {
  return {
    workspaceEpoch: state.dataEpoch,
    revision: state.revision,
    today: toHongKongDate(),
    now: new Date().toISOString(),
    ...(total === undefined ? {} : { total })
  };
}