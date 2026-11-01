import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { ApiEnvelope, TaskDto } from '@shared/api-types';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS
} from '@shared/enums';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useSessionQuery } from '../session/useSession';
import { useAreasQuery, useProjectsQuery, useTaskQuery, useWorkspaceInvalidate } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

interface TaskForm {
  title: string;
  description: string;
  projectId: string;
  areaId: string;
  status: TaskDto['status'];
  priority: TaskDto['priority'];
  plannedOn: string;
  dueOn: string;
  dueAtLocal: string;
  followUpOn: string;
  estimatedMinutes: string;
  tags: string;
  archived: boolean;
}

function toHongKongInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(iso));
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}:00+08:00`).toISOString();
}

function formFromTask(task: TaskDto): TaskForm {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId ?? '',
    areaId: task.areaId ?? '',
    status: task.status,
    priority: task.priority,
    plannedOn: task.plannedOn ?? '',
    dueOn: task.dueOn ?? '',
    dueAtLocal: toHongKongInput(task.dueAt),
    followUpOn: task.followUpOn ?? '',
    estimatedMinutes: task.estimatedMinutes === null ? '' : String(task.estimatedMinutes),
    tags: task.tags.join(', '),
    archived: task.archivedAt !== null
  };
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const task = useTaskQuery(id);
  const areas = useAreasQuery();
  const projects = useProjectsQuery({ limit: '200' });
  const session = useSessionQuery();
  const invalidate = useWorkspaceInvalidate();
  const [form, setForm] = useState<TaskForm | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (task.data) {
      setForm(formFromTask(task.data.data));
    }
  }, [task.data]);

  const save = useMutation({
    mutationFn: (values: TaskForm) => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch || !task.data) {
        throw new Error('登入狀態尚未就緒');
      }
      const minutes = values.estimatedMinutes.trim();
      return apiRequest<ApiEnvelope<TaskDto>>(`/tasks/${task.data.data.id}`, {
        method: 'PATCH',
        body: {
          version: task.data.data.version,
          title: values.title,
          description: values.description,
          projectId: values.projectId || null,
          areaId: values.projectId ? null : values.areaId || null,
          status: values.status,
          priority: values.priority,
          plannedOn: values.plannedOn || null,
          dueOn: values.dueAtLocal ? null : values.dueOn || null,
          dueAt: localInputToIso(values.dueAtLocal),
          dueTimezone: values.dueAtLocal ? 'Asia/Hong_Kong' : null,
          followUpOn: values.followUpOn || null,
          estimatedMinutes: minutes ? Number(minutes) : null,
          tags: values.tags
            .split(/[,，\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 10),
          archived: values.archived
        },
        csrfToken: sessionData.csrfToken,
        workspaceEpoch: sessionData.workspaceEpoch
      });
    },
    onSuccess: async () => {
      setMessage('已儲存');
      await invalidate();
    }
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!form) return;
    setMessage(null);
    save.mutate(form);
  };

  if (task.isPending) {
    return <PageStatus kind="loading" title="正在讀取任務…" />;
  }
  if (task.isError || !task.data) {
    return (
      <PageStatus
        kind="error"
        title="找不到任務"
        description="任務可能已被移除，或網址不正確。"
        onRetry={() => void task.refetch()}
      />
    );
  }
  if (!form) {
    return <PageStatus kind="loading" title="正在準備表單…" />;
  }

  const error =
    save.error instanceof ApiError
      ? Object.values(save.error.fieldErrors ?? {})[0] ?? save.error.message
      : save.error?.message;
  const data = task.data.data;

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>任務詳情</p>
        <h1 className={ui.title}>{data.title}</h1>
        <p className={ui.lede}>
          版本 {data.version} · 最後更新 {new Date(data.updatedAt).toLocaleString('zh-HK')}
                        {data.effectiveAreaId ? ' · 領域由項目或任務決定' : ''}
        </p>
        <div className={ui.actions}>
          <Link className={`${ui.button} ${ui.secondary}`} to="/tasks">
            返回所有任務
          </Link>
          <Link className={`${ui.button} ${ui.secondary}`} to="/">
            返回總覽
          </Link>
        </div>
      </header>

      <section className={ui.card}>
        <form className={ui.form} onSubmit={handleSubmit}>
          <div className={ui.grid}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-title">
                標題
              </label>
              <input
                id="edit-title"
                className={ui.input}
                value={form.title}
                maxLength={200}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-status">
                狀態
              </label>
              <select
                id="edit-status"
                className={ui.select}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as TaskDto['status'] })
                }
              >
                {TASK_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={ui.field}>
            <label className={ui.label} htmlFor="edit-description">
              備註
            </label>
            <textarea
              id="edit-description"
              className={ui.textarea}
              maxLength={20000}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>

          <div className={ui.gridThree}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-project">
                項目
              </label>
              <select
                id="edit-project"
                className={ui.select}
                value={form.projectId}
                onChange={(event) =>
                  setForm({ ...form, projectId: event.target.value, areaId: '' })
                }
              >
                <option value="">無項目</option>
                {projects.data?.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-area">
                領域
              </label>
              <select
                id="edit-area"
                className={ui.select}
                value={form.projectId ? (data.effectiveAreaId ?? '') : form.areaId}
                onChange={(event) => setForm({ ...form, areaId: event.target.value })}
                disabled={Boolean(form.projectId)}
              >
                <option value="">未分類</option>
                {areas.data?.data.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-priority">
                優先次序
              </label>
              <select
                id="edit-priority"
                className={ui.select}
                value={form.priority}
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value as TaskDto['priority'] })
                }
              >
                {TASK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'high' ? '高' : value === 'low' ? '低' : '普通'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={ui.gridThree}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-planned">
                安排日
              </label>
              <input
                id="edit-planned"
                type="date"
                className={ui.input}
                value={form.plannedOn}
                onChange={(event) => setForm({ ...form, plannedOn: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-due-on">
                截止日期
              </label>
              <input
                id="edit-due-on"
                type="date"
                className={ui.input}
                value={form.dueOn}
                onChange={(event) => setForm({ ...form, dueOn: event.target.value })}
                disabled={Boolean(form.dueAtLocal)}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-due-at">
                截止時間（香港）
              </label>
              <input
                id="edit-due-at"
                type="datetime-local"
                className={ui.input}
                value={form.dueAtLocal}
                onChange={(event) => setForm({ ...form, dueAtLocal: event.target.value })}
                disabled={Boolean(form.dueOn)}
              />
            </div>
          </div>

          <div className={ui.gridThree}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-follow-up">
                下次跟進
              </label>
              <input
                id="edit-follow-up"
                type="date"
                className={ui.input}
                value={form.followUpOn}
                onChange={(event) => setForm({ ...form, followUpOn: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-estimate">
                預估分鐘
              </label>
              <input
                id="edit-estimate"
                type="number"
                min={1}
                className={ui.input}
                value={form.estimatedMinutes}
                onChange={(event) => setForm({ ...form, estimatedMinutes: event.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="edit-tags">
                標籤（逗號分隔）
              </label>
              <input
                id="edit-tags"
                className={ui.input}
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
              />
            </div>
          </div>

          <label className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={form.archived}
              onChange={(event) => setForm({ ...form, archived: event.target.checked })}
            />
            封存此任務（不出現在日常清單）
          </label>

          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={save.isPending}>
              {save.isPending ? '儲存中…' : '儲存'}
            </button>
            {message ? <span className={ui.success}>{message}</span> : null}
            {error ? <span className={ui.error}>{error}</span> : null}
          </div>
        </form>
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>原生資料</h2>
        </div>
        <div className={ui.meta}>
          <span>UUID：{data.id}</span>
          <span>建立：{new Date(data.createdAt).toLocaleString('zh-HK')}</span>
          {data.completedAt ? (
            <span>完成：{new Date(data.completedAt).toLocaleString('zh-HK')}</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}