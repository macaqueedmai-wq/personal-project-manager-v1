import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ApiEnvelope, DashboardTaskItem, FocusDayDto, TaskDto } from '@shared/api-types';
import { TASK_STATUS_LABELS } from '@shared/enums';
import { ApiError, apiRequest } from '../../api/client';
import { useSessionQuery } from '../session/useSession';
import { useWorkspaceInvalidate } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

interface FocusEditorProps {
  date: string;
  version: number;
  focusTasks: TaskDto[];
  candidates: DashboardTaskItem[];
}

export function FocusEditor({ date, version, focusTasks, candidates }: FocusEditorProps) {
  const session = useSessionQuery();
  const invalidate = useWorkspaceInvalidate();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelected(focusTasks.map((task) => task.id));
  }, [focusTasks, version]);

  const options = useMemo(() => {
    const map = new Map<string, TaskDto>();
    for (const item of candidates) {
      map.set(item.task.id, item.task);
    }
    for (const task of focusTasks) {
      map.set(task.id, task);
    }
    return [...map.values()];
  }, [candidates, focusTasks]);

  const save = useMutation({
    mutationFn: () => {
      const sessionData = session.data?.data;
      if (!sessionData?.csrfToken || !sessionData.workspaceEpoch) {
        throw new Error('登入狀態尚未就緒');
      }
      return apiRequest<ApiEnvelope<FocusDayDto>>(`/focus/${date}`, {
        method: 'PUT',
        body: { taskIds: selected, version },
        csrfToken: sessionData.csrfToken,
        workspaceEpoch: sessionData.workspaceEpoch
      });
    },
    onSuccess: async () => {
      setMessage('今日重點已更新');
      await invalidate();
    }
  });

  const error =
    save.error instanceof ApiError
      ? save.error.fieldErrors?.taskIds ?? save.error.message
      : save.error?.message;

  const toggle = (taskId: string): void => {
    if (selected.includes(taskId)) {
      setSelected(selected.filter((id) => id !== taskId));
      setMessage(null);
      return;
    }
    if (selected.length >= 3) {
      setMessage('每日最多三項重點');
      return;
    }
    setSelected([...selected, taskId]);
    setMessage(null);
  };

  return (
    <section className={ui.card} aria-labelledby="focus-heading">
      <div className={ui.cardHeader}>
        <h2 id="focus-heading" className={ui.sectionTitle}>
          今日重點
        </h2>
        <span className={ui.muted}>{selected.length} / 3</span>
      </div>
      {options.length === 0 ? (
        <p className={ui.empty}>
          今天還沒有可選任務。先安排任務到今天，或從本週任務挑選。
        </p>
      ) : (
        <div className={ui.list}>
          {options.map((task) => (
            <label key={task.id} className={ui.checkboxRow} style={{ padding: '7px 0' }}>
              <input
                type="checkbox"
                checked={selected.includes(task.id)}
                onChange={() => toggle(task.id)}
              />
              <span>
                {task.title}
                <span className={ui.muted}> · {TASK_STATUS_LABELS[task.status]}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className={ui.actions} style={{ marginTop: 12 }}>
        <button
          type="button"
          className={ui.button}
          disabled={save.isPending || options.length === 0}
          onClick={() => save.mutate()}
        >
          {save.isPending ? '儲存中…' : '儲存今日重點'}
        </button>
      </div>
      {message ? <p className={ui.muted}>{message}</p> : null}
      {error ? <p className={ui.error}>{error}</p> : null}
      <p className={ui.muted}>已完成的重點仍保留在當日，不會自動複製到明天。</p>
    </section>
  );
}