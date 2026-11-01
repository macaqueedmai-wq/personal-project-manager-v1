import { Router } from 'express';
import type { ApiEnvelope, ResourceDto, ResourceLinkDto } from '../../shared/api-types.js';
import {
  resourceInputSchema,
  resourceLinkInputSchema,
  resourceListQuerySchema,
  resourceUpdateSchema
} from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { readWorkspaceState } from '../db/system-state.js';
import { AppError, parseOrThrow } from '../errors.js';
import {
  addResourceLink,
  createResource,
  deleteResourceLink,
  getResource,
  listResourceLinks,
  listResources,
  updateResource
} from '../services/resources.js';
import { assertUuidParam, buildMeta, readWorkspaceEpoch } from './helpers.js';

export function createResourcesRouter(pool: DbPool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = parseOrThrow(resourceListQuerySchema, req.query);
    const [{ items, total }, state] = await Promise.all([
      listResources(pool, query),
      readWorkspaceState(pool)
    ]);
    const body: ApiEnvelope<ResourceDto[]> = { data: items, meta: buildMeta(state, total) };
    res.json(body);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(resourceInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { resource, revision } = await createResource(pool, input, epoch);
    const body: ApiEnvelope<ResourceDto> = {
      data: resource,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.get('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const resource = await getResource(pool, id);
    if (!resource) throw new AppError(404, 'RESOURCE_NOT_FOUND', '找不到這份文件連結');
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<ResourceDto> = { data: resource, meta: buildMeta(state) };
    res.json(body);
  });

  router.patch('/:id', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(resourceUpdateSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { resource, revision } = await updateResource(pool, id, input, epoch);
    const body: ApiEnvelope<ResourceDto> = {
      data: resource,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  router.get('/:id/links', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const links = await listResourceLinks(pool, id);
    const state = await readWorkspaceState(pool);
    const body: ApiEnvelope<ResourceLinkDto[]> = { data: links, meta: buildMeta(state) };
    res.json(body);
  });

  router.post('/:id/links', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const input = parseOrThrow(resourceLinkInputSchema, req.body);
    const epoch = readWorkspaceEpoch(req);
    const { link, revision } = await addResourceLink(pool, id, input, epoch);
    const body: ApiEnvelope<ResourceLinkDto> = {
      data: link,
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.status(201).json(body);
  });

  router.delete('/:id/links/:linkId', async (req, res) => {
    const id = assertUuidParam(req.params.id);
    const linkId = assertUuidParam(req.params.linkId);
    const version = Number(req.query.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new AppError(400, 'INVALID_VERSION', '版本不正確');
    }
    const epoch = readWorkspaceEpoch(req);
    const { revision } = await deleteResourceLink(pool, id, linkId, version, epoch);
    const body: ApiEnvelope<{ ok: true }> = {
      data: { ok: true },
      meta: buildMeta({ revision, dataEpoch: epoch })
    };
    res.json(body);
  });

  return router;
}