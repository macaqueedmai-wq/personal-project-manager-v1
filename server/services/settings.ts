import type { AppSettingsDto } from '../../shared/api-types.js';
import type { DbPool } from '../db/pool.js';
import { AppError } from '../errors.js';

export async function getAppSettings(pool: DbPool): Promise<AppSettingsDto> {
  const { rows } = await pool.query<AppSettingsDto>(
    `select locale, timezone, week_starts_on as "weekStartsOn" from app_settings where id = 1`
  );
  const settings = rows[0];
  if (!settings) {
    throw new AppError(503, 'SETTINGS_NOT_READY', '設定尚未初始化，請執行資料庫遷移');
  }
  return settings;
}