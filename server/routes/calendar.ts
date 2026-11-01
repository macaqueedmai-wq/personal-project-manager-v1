import { Router } from 'express';
import type { ApiEnvelope, CalendarOccurrence } from '../../shared/api-types.js';
import { calendarQuerySchema } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { parseOrThrow } from '../errors.js';
import { getCalendar } from '../services/calendar.js';
import { buildMeta } from './helpers.js';

export function createCalendarRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(calendarQuerySchema, req.query);
    const [occurrences, state] = await Promise.all([
      getCalendar(pool, query.from, query.to, query.areaId),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<CalendarOccurrence[]> = {
      data: occurrences,
      meta: buildMeta(state)
    };
    res.json(body);
  });

  return router;
}