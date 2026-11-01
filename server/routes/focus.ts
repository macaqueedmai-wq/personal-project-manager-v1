import { Router } from 'express';
import type { ApiEnvelope, FocusDayDto } from '../../shared/api-types.js';
import { isoDateSchema } from '../../shared/schemas.js';
import { focusPutSchema } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import { getFocusDay, putFocusDay } from '../services/focus.js';
import { buildMeta, readWorkspaceEpoch } from './helpers.js';

function assertDate(value: string): string {
  if (!isoDateSchema.safeParse(value).success) {
    throw new AppError(400, 'INVALID_DATE', '日期格式不正確');
  }
  return value;
}

export function createFocusRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/:date', async (req, res) => {
    const date = assertDate(req.params.date);
    const focus = await getFocusDay(pool, date);
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<FocusDayDto> = { data: focus, meta: buildMeta(state) };
    res.json(body);
  });

  router.put('/:date', async (req, res) => {
    const date = assertDate(req.params.date);
    const input = parseOrThrow(focusPutSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { focus, revision } = await putFocusDay(pool, date, input, epoch);
    const body: ApiEnvelope<FocusDayDto> = {
      data: focus,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}