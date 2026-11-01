import { Router } from 'express';
import type { ApiEnvelope, HealthEntryDto } from '../../shared/api-types.js';
import {
  healthEntryInputSchema,
  healthEntryUpdateSchema,
  healthListQuerySchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import {
  createHealthEntry,
  getHealthEntry,
  listHealthEntries,
  updateHealthEntry
} from '../services/health.js';
import { assertUuidParam, buildMeta, readWorkspaceEpoch } from './helpers.js';

export function createHealthRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(healthListQuerySchema, req.query);
    const [{ items, total }, state] = await Promise.all([
      listHealthEntries(pool, query),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<HealthEntryDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(healthEntryInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { entry, revision } = await createHealthEntry(pool, input, epoch);
    const body: ApiEnvelope<HealthEntryDto> = {
      data: entry,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const entry = await getHealthEntry(pool, id);
    if (!entry) throw new AppError(404, 'HEALTH_ENTRY_NOT_FOUND', '找不到這筆健康紀錄');
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<HealthEntryDto> = { data: entry, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(healthEntryUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { entry, revision } = await updateHealthEntry(pool, id, input, epoch);
    const body: ApiEnvelope<HealthEntryDto> = {
      data: entry,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}