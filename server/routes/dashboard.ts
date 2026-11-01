import { Router } from 'express';
import type { ApiEnvelope, DashboardDto } from '../../shared/api-types.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { getDashboard } from '../services/dashboard.js';
import { buildMeta } from './helpers.js';

export function createDashboardRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const [dashboard, state] = await Promise.all([getDashboard(pool), readWorkspaceState(pool)]);
    const body: ApiEnvelope<DashboardDto> = { data: dashboard, meta: buildMeta(state) };
    res.json(body);
  });

  return router;
}