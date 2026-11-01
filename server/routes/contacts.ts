import { Router } from 'express';
import type { ApiEnvelope, ContactDto, InteractionDto } from '../../shared/api-types.js';
import {
  contactInputSchema,
  contactListQuerySchema,
  contactUpdateSchema,
  interactionInputSchema,
  interactionUpdateSchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import {
  createContact,
  createInteraction,
  getContact,
  listContacts,
  listInteractions,
  updateContact,
  updateInteraction
} from '../services/contacts.js';
import { assertUuidParam, buildMeta, readWorkspaceEpoch } from './helpers.js';

export function createContactsRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(contactListQuerySchema, req.query);
    const [{ items, total }, state] = await Promise.all([
      listContacts(pool, query),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<ContactDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(contactInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { contact, revision } = await createContact(pool, input, epoch);
    const body: ApiEnvelope<ContactDto> = {
      data: contact,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const contact = await getContact(pool, id);
    if (!contact) throw new AppError(404, 'CONTACT_NOT_FOUND', '找不到這位人物');
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<ContactDto> = { data: contact, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(contactUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { contact, revision } = await updateContact(pool, id, input, epoch);
    const body: ApiEnvelope<ContactDto> = {
      data: contact,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.get('/:id/interactions', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const interactions = await listInteractions(pool, id);
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<InteractionDto[]> = {
      data: interactions,
      meta: buildMeta(state)
    };
    res.json(body);
  });

  router.post('/:id/interactions', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(interactionInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { interaction, revision } = await createInteraction(pool, id, input, epoch);
    const body: ApiEnvelope<InteractionDto> = {
      data: interaction,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  return router;
}

export function createInteractionsRouter(pool: DbPool): Router {
  const router = Router();

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(interactionUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { interaction, revision } = await updateInteraction(pool, id, input, epoch);
    const body: ApiEnvelope<InteractionDto> = {
      data: interaction,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}