import { Router } from 'express';
import type { ApiEnvelope, AreaDto, ResponseMeta } from '../../shared/api-types.js';
import { toHongKongDate } from '../../shared/dates.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { listAreas } from '../repositories/areas.js';

export function createAreasRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const [areas, state] = await Promise.all([listAreas(pool), readWorkspaceState(pool)]);
    const meta: ResponseMeta = {
      workspaceEpoch: state.dataEpoch,
      revision: state.revision,
      today: toHongKongDate(),
      now: new Date().toISOString()
    };
    const body: ApiEnvelope<AreaDto[]> = { data: areas, meta };
    res.json(body);
  });

  return router;
}
