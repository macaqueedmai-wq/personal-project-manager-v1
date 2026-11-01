import { Router } from 'express';
import type { ApiEnvelope, EventDto } from '../../shared/api-types.js';
import {
  createEventSchema,
  eventContactsSchema,
  eventListQuerySchema,
  eventRelatedAreasSchema,
  updateEventSchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import {
  createEvent,
  getEvent,
  listEvents,
  updateEvent,
  updateEventContacts,
  updateEventRelatedAreas
} from '../services/events.js';
import { assertUuidParam, buildMeta, readWorkspaceEpoch } from './helpers.js';

export function createEventsRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(eventListQuerySchema, req.query);
    const [{ items, total }, state] = await Promise.all([
      listEvents(pool, query),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<EventDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createEventSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { event, revision } = await createEvent(pool, input, epoch);
    const body: ApiEnvelope<EventDto> = {
      data: event,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const event = await getEvent(pool, id);
    if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', '找不到這個活動');
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<EventDto> = { data: event, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(updateEventSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { event, revision } = await updateEvent(pool, id, input, epoch);
    const body: ApiEnvelope<EventDto> = {
      data: event,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.put('/:id/related-areas', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(eventRelatedAreasSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { areaIds, revision } = await updateEventRelatedAreas(pool, id, input, epoch);
    const body: ApiEnvelope<{ areaIds: typeof areaIds }> = {
      data: { areaIds },
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.put('/:id/contacts', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(eventContactsSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { contactIds, revision } = await updateEventContacts(pool, id, input, epoch);
    const body: ApiEnvelope<{ contactIds: typeof contactIds }> = {
      data: { contactIds },
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}