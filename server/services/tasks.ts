import type { PoolClient } from 'pg';
import type { TaskDto } from '../../shared/api-types.js';
import type { CreateTaskInput, UpdateTaskInput } from '../../shared/schemas.js';
import type { DbPool } from '../db/pool.js';
import { withWorkspaceWrite } from '../db/system-state.js';
import { AppError } from '../errors.js';
import {
  insertTask,
  selectProjectPrimaryArea,
  selectTaskById,
  selectTaskForUpdate,
  selectTasks,
  updateTaskColumns,
  type TaskListFilters
} from '../repositories/tasks.js';

export async function listTasks(
  pool: DbPool,
  filters: TaskListFilters
): Promise<{ items: TaskDto[]; total: number }> {
  return selectTasks(pool, filters);
}

export async function getTask(pool: DbPool, id: string): Promise<TaskDto | null> {
  return selectTaskById(pool, id);
}

async function validateProject(
  client: PoolClient,
  projectId: string
): Promise<{ primaryAreaId: TaskDto['effectiveAreaId']; archivedAt: string | null }> {
  const project = await selectProjectPrimaryArea(client, projectId);
  if (!project) {
    throw new AppError(400, 'PROJECT_NOT_FOUND', '找不到指定項目', {
      projectId: '找不到指定項目'
    });
  }
  if (project.archivedAt) {
    throw new AppError(400, 'PROJECT_ARCHIVED', '項目已封存，不能加入新任務', {
      projectId: '項目已封存'
    });
  }
  return project;
}

async function assertContactExists(client: PoolClient, contactId: string): Promise<void> {
  const { rowCount } = await client.query('select 1 from contacts where id = $1', [contactId]);
  if (rowCount === 0) {
    throw new AppError(400, 'CONTACT_NOT_FOUND', '找不到指定人物', {
      contactId: '找不到指定人物'
    });
  }
}

async function assertEventExists(client: PoolClient, eventId: string): Promise<void> {
  const { rowCount } = await client.query('select 1 from events where id = $1', [eventId]);
  if (rowCount === 0) {
    throw new AppError(400, 'EVENT_NOT_FOUND', '找不到指定活動', {
      eventId: '找不到指定活動'
    });
  }
}

function assertDuePair(
  dueOn: string | null,
  dueAt: string | null,
  dueTimezone: string | null
): void {
  if (dueOn !== null && dueAt !== null) {
    throw new AppError(400, 'INVALID_DUE', '截止日期與截止時間不可同時設定', {
      dueAt: '截止日期與截止時間不可同時設定'
    });
  }
  if (dueAt !== null && dueTimezone === null) {
    throw new AppError(400, 'INVALID_DUE', '精確截止需要時區', {
      dueTimezone: '精確截止需要時區'
    });
  }
  if (dueAt === null && dueTimezone !== null) {
    throw new AppError(400, 'INVALID_DUE', '沒有精確截止時不可設定時區', {
      dueTimezone: '沒有精確截止時不可設定時區'
    });
  }
}

export async function createTask(
  pool: DbPool,
  input: CreateTaskInput,
  workspaceEpoch: string
): Promise<{ task: TaskDto; revision: string }> {
  const { value, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    let areaId = input.areaId ?? null;

    if (input.projectId) {
      await validateProject(client, input.projectId);
      areaId = null;
    }
    if (input.contactId) {
      await assertContactExists(client, input.contactId);
    }
    if (input.eventId) {
      await assertEventExists(client, input.eventId);
    }

    return insertTask(client, {
      title: input.title,
      description: input.description ?? '',
      projectId: input.projectId ?? null,
      areaId,
      priority: input.priority ?? 'normal',
      plannedOn: input.plannedOn ?? null,
      dueOn: input.dueOn ?? null,
      dueAt: input.dueAt ?? null,
      dueTimezone: input.dueTimezone ?? null,
      followUpOn: input.followUpOn ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      tags: input.tags ?? [],
      contactId: input.contactId ?? null,
      eventId: input.eventId ?? null
    });
  });

  return { task: value, revision };
}

export async function updateTask(
  pool: DbPool,
  taskId: string,
  input: UpdateTaskInput,
  workspaceEpoch: string
): Promise<{ task: TaskDto; revision: string }> {
  const { value, revision } = await withWorkspaceWrite(pool, workspaceEpoch, async (client) => {
    const current = await selectTaskForUpdate(client, taskId);
    if (!current) {
      throw new AppError(404, 'TASK_NOT_FOUND', '找不到這項任務');
    }
    if (current.version !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', '資料已更新，請重新載入');
    }

    const patch: Record<string, unknown> = {};
    let nextProjectId = current.projectId;
    let nextAreaId = current.areaId;

    if (Object.hasOwn(input, 'projectId')) {
      if (input.projectId) {
        if (Object.hasOwn(input, 'areaId') && input.areaId !== null) {
          throw new AppError(400, 'PROJECT_AREA_CONFLICT', '有項目時不可另外指定領域', {
            areaId: '有項目時不可另外指定領域'
          });
        }
        await validateProject(client, input.projectId);
        nextProjectId = input.projectId;
        nextAreaId = null;
        patch.projectId = input.projectId;
        patch.areaId = null;
      } else {
        patch.projectId = null;
        nextProjectId = null;

        if (Object.hasOwn(input, 'areaId')) {
          nextAreaId = input.areaId ?? null;
        } else if (current.projectId) {
          const previousProject = await selectProjectPrimaryArea(client, current.projectId);
          nextAreaId = previousProject?.primaryAreaId ?? current.areaId;
        }
        patch.areaId = nextAreaId;
      }
    } else if (Object.hasOwn(input, 'areaId')) {
      if (current.projectId && input.areaId !== null) {
        throw new AppError(400, 'PROJECT_AREA_CONFLICT', '有項目時不可另外指定領域', {
          areaId: '有項目時不可另外指定領域'
        });
      }
      nextAreaId = input.areaId ?? null;
      patch.areaId = nextAreaId;
    }

    if (nextProjectId !== null && nextAreaId !== null) {
      throw new AppError(400, 'PROJECT_AREA_CONFLICT', '有項目時不可另外指定領域', {
        areaId: '有項目時不可另外指定領域'
      });
    }

    const dueOn = Object.hasOwn(input, 'dueOn') ? (input.dueOn ?? null) : current.dueOn;
    const dueAt = Object.hasOwn(input, 'dueAt') ? (input.dueAt ?? null) : current.dueAt;
    const dueTimezone = Object.hasOwn(input, 'dueTimezone')
      ? (input.dueTimezone ?? null)
      : current.dueTimezone;
    assertDuePair(dueOn, dueAt, dueTimezone);

    for (const key of [
      'title',
      'description',
      'priority',
      'plannedOn',
      'dueOn',
      'dueAt',
      'dueTimezone',
      'followUpOn',
      'estimatedMinutes',
      'tags',
      'contactId',
      'eventId'
    ] as const) {
      if (Object.hasOwn(input, key)) {
        patch[key] = input[key];
      }
    }

    if (input.contactId) {
      await assertContactExists(client, input.contactId);
    }
    if (input.eventId) {
      await assertEventExists(client, input.eventId);
    }

    if (input.status !== undefined) {
      patch.status = input.status;
      if (input.status === 'done' && current.status !== 'done') {
        patch.completedAt = new Date().toISOString();
      } else if (input.status !== 'done') {
        patch.completedAt = null;
      } else if (current.completedAt === null) {
        patch.completedAt = new Date().toISOString();
      }
    }

    if (input.archived !== undefined) {
      patch.archivedAt = input.archived ? new Date().toISOString() : null;
    }

    if (Object.keys(patch).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', '沒有任何變更');
    }

    await updateTaskColumns(client, taskId, input.version, patch);
    const updated = await selectTaskById(client, taskId);
    if (!updated) {
      throw new Error('updated task could not be read back');
    }
    return updated;
  });

  return { task: value, revision };
}
