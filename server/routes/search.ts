import { Router } from 'express';
import type { ApiEnvelope, SearchResultDto } from '../../shared/api-types.js';
import { searchQuerySchema } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { parseOrThrow } from '../errors.js';
import { searchWorkspace } from '../services/search.js';
import { buildMeta } from './helpers.js';

export function createSearchRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(searchQuerySchema, req.query);
    const [results, state] = await Promise.all([
      searchWorkspace(pool, query.q, query.archived, query.limit),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<SearchResultDto[]> = { data: results, meta: buildMeta(state) };
    res.json(body);
  });

  return router;
}