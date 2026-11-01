import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ApiEnvelope, TaskDto } from '@shared/api-types';
import { ApiError, apiRequest } from '../../api/client';
import { useSessionQuery } from '../session/useSession';
import { useWorkspaceInvalidate } from '../workspace/hooks';
import styles from './QuickAdd.module.css';

export function QuickAdd() {
  const invalidateWorkspace = useWorkspaceInvalidate();
  const session = useSessionQuery();
  const [title, setTitle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) => {
      const data = session.data?.data;

      if (!data?.csrfToken || !data.workspaceEpoch) {
        throw new Error('登入狀態尚未就緒，請重新載入頁面。');
      }

      return apiRequest<ApiEnvelope<TaskDto>>('/tasks', {
        method: 'POST',
        body: { title: value },
        csrfToken: data.csrfToken,
        workspaceEpoch: data.workspaceEpoch
      });
    },
    onSuccess: async (response) => {
      setTitle('');
      setLocalError(null);
      setAnnouncement(`已新增「${response.data.title}」`);
      await invalidateWorkspace();
    }
  });

  const error = mutation.error;
  let fieldError = localError;
  if (error instanceof ApiError) {
    fieldError =
      error.fieldErrors?.title ??
      (error.status === 409
        ? '資料已更新，請重新載入頁面後再試。'
        : error.message);
  } else if (error && !localError) {
    fieldError = error.message;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = title.trim();

    if (trimmed.length === 0) {
      setLocalError('請輸入標題。');
      setAnnouncement(null);
      return;
    }

    setLocalError(null);
    mutation.mutate(trimmed);
  };

  return (
    <section className={styles.card} aria-labelledby="quick-add-heading">
      <div className={styles.header}>
        <h2 id="quick-add-heading" className={styles.heading}>
          快速新增
        </h2>
        <p className={styles.hint}>只填標題即可。分類與排程會在下一階段加入。</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="quick-add-title" className={styles.label}>
            任務標題
          </label>
          <input
            id="quick-add-title"
            name="title"
            type="text"
            className={styles.input}
            placeholder="例如：閱讀方法論文章"
            value={title}
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value);
              if (localError) {
                setLocalError(null);
              }
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'quick-add-error' : undefined}
            disabled={mutation.isPending}
          />
        </div>

        <button type="submit" className={styles.submit} disabled={mutation.isPending}>
          {mutation.isPending ? '儲存中…' : '加入'}
        </button>
      </form>

      {fieldError ? (
        <p id="quick-add-error" className={styles.error} role="alert">
          {fieldError}
        </p>
      ) : null}

      <p className={styles.status} role="status" aria-live="polite">
        {announcement ?? ''}
      </p>
    </section>
  );
}
