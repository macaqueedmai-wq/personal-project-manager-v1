import { Router } from 'express';
import type { ApiEnvelope, AppSettingsDto } from '../../shared/api-types.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { getAppSettings } from '../services/settings.js';
import { buildMeta } from './helpers.js';

export function createSettingsRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const [settings, state] = await Promise.all([
      getAppSettings(pool),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<AppSettingsDto> = { data: settings, meta: buildMeta(state) };
    res.json(body);
  });

  return router;
}