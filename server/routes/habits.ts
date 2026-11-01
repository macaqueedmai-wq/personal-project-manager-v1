import { Router } from 'express';
import type { ApiEnvelope, HabitDto, HabitEntryDto } from '../../shared/api-types.js';
import { isValidIsoDate } from '../../shared/dates.js';
import {
  habitEntryInputSchema,
  habitEntryRangeQuerySchema,
  habitInputSchema,
  habitListQuerySchema,
  habitUpdateSchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import {
  createHabit,
  deleteHabitEntry,
  getHabit,
  listHabitEntries,
  listHabits,
  putHabitEntry,
  updateHabit
} from '../services/habits.js';
import { assertUuidParam, buildMeta, readWorkspaceEpoch } from './helpers.js';

export function createHabitsRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(habitListQuerySchema, req.query);
    const [{ items, total }, state] = await Promise.all([
      listHabits(pool, query),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<HabitDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(habitInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { habit, revision } = await createHabit(pool, input, epoch);
    const body: ApiEnvelope<HabitDto> = {
      data: habit,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const habit = await getHabit(pool, id);
    if (!habit) throw new AppError(404, 'HABIT_NOT_FOUND', '找不到這個習慣');
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<HabitDto> = { data: habit, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(habitUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { habit, revision } = await updateHabit(pool, id, input, epoch);
    const body: ApiEnvelope<HabitDto> = {
      data: habit,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.get('/:id/entries', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const query = parseOrThrow(habitEntryRangeQuerySchema, req.query);
    const [entries, state] = await Promise.all([
      listHabitEntries(pool, id, query.from, query.to),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<HabitEntryDto[]> = { data: entries, meta: buildMeta(state) };
    res.json(body);
  });

  router.put('/:id/entries/:date', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const localDate = req.params.date;
    if (!isValidIsoDate(localDate)) {
      throw new AppError(400, 'INVALID_DATE', '日期格式不正確');
    }
    const input = parseOrThrow(habitEntryInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { entry, revision } = await putHabitEntry(pool, id, localDate, input, epoch);
    const body: ApiEnvelope<HabitEntryDto> = {
      data: entry,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.delete('/:id/entries/:date', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const localDate = req.params.date;
    if (!isValidIsoDate(localDate)) {
      throw new AppError(400, 'INVALID_DATE', '日期格式不正確');
    }
    const epoch = readWorkspaceEpoch(req);
    const { deleted, revision } = await deleteHabitEntry(pool, id, localDate, epoch);
    const body: ApiEnvelope<{ deleted: boolean }> = {
      data: { deleted },
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}