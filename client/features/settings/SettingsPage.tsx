import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ApiEnvelope, BackupPreviewDto, BackupCountsDto } from '@shared/api-types';
import { ApiError } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import {
  useContactsQuery,
  useEventsQuery,
  useHabitsQuery,
  useProjectsQuery,
  useResourcesQuery,
  useSettingsQuery,
  useTasksQuery,
  useWorkspaceInvalidate,
  useWriteContext
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

interface ArchivedItem {
  id: string;
  title: string;
  version: number;
  path: string;
}

function countLabel(counts: BackupCountsDto): string {
  return `領域 ${counts.areas} · 項目 ${counts.projects} · 任務 ${counts.tasks} · 活動 ${counts.events} · 人物 ${counts.contacts} · 文件 ${counts.resources} · 習慣 ${counts.habits} · 健康 ${counts.healthEntries} · 課程 ${counts.courseDetails ?? 0} · 申請 ${counts.applications ?? 0} · 申請歷史 ${counts.applicationStageHistory ?? 0} · 重點日 ${counts.focusDays ?? 0} · 互動 ${counts.interactions ?? 0} · 文件關聯 ${counts.resourceLinks ?? 0} · 習慣打卡 ${counts.habitEntries ?? 0}`;
}

async function readError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const body = payload as {
    error?: { code?: string; message?: string; fieldErrors?: Record<string, string> };
  } | null;
  return new ApiError(
    response.status,
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? `請求失敗（${response.status}）`,
    body?.error?.fieldErrors
  );
}

function filenameFromResponse(response: Response): string {
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? 'ppm-backup.json';
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const settings = useSettingsQuery();
  const archivedTasks = useTasksQuery({ archived: 'only', limit: '200' });
  const archivedProjects = useProjectsQuery({ archived: 'only', limit: '200' });
  const archivedEvents = useEventsQuery({ archived: 'only', limit: '200' });
  const archivedContacts = useContactsQuery({ archived: 'only', limit: '200' });
  const archivedResources = useResourcesQuery({ archived: 'only', limit: '200' });
  const archivedHabits = useHabitsQuery({ archived: 'only', limit: '200' });
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreviewDto | null>(null);
  const [snapshotDownloaded, setSnapshotDownloaded] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restoreArchived = useMutation({
    mutationFn: (item: ArchivedItem) => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return fetch(`/api/v1${item.path}/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': context.csrfToken,
          'X-Workspace-Epoch': context.workspaceEpoch
        },
        body: JSON.stringify({ version: item.version, archived: false })
      }).then(async (response) => {
        if (!response.ok) throw await readError(response);
        return response.json();
      });
    },
    onSuccess: async () => {
      setMessage('已恢復封存紀錄');
      await invalidate();
    },
    onError: (mutationError) => {
      setError(mutationError instanceof ApiError ? mutationError.message : '恢復失敗');
    }
  });

  const archivedItems: ArchivedItem[] = [
    ...(archivedTasks.data?.data ?? []).filter((task) => task.archivedAt).map((task) => ({
      id: task.id, title: `任務：${task.title}`, version: task.version, path: '/tasks'
    })),
    ...(archivedProjects.data?.data ?? []).map((project) => ({
      id: project.id, title: `項目：${project.title}`, version: project.version, path: '/projects'
    })),
    ...(archivedEvents.data?.data ?? []).map((event) => ({
      id: event.id, title: `活動：${event.title}`, version: event.version, path: '/events'
    })),
    ...(archivedContacts.data?.data ?? []).map((contact) => ({
      id: contact.id, title: `人物：${contact.name}`, version: contact.version, path: '/contacts'
    })),
    ...(archivedResources.data?.data ?? []).map((resource) => ({
      id: resource.id, title: `文件：${resource.title}`, version: resource.version, path: '/resources'
    })),
    ...(archivedHabits.data?.data ?? []).map((habit) => ({
      id: habit.id, title: `習慣：${habit.title}`, version: habit.version, path: '/habits'
    }))
  ];

  const exportNow = async (): Promise<void> => {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/backup/export');
      if (!response.ok) throw await readError(response);
      saveBlob(await response.blob(), filenameFromResponse(response));
      setMessage('已下載完整備份；實體附件不包含在內。');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '匯出失敗');
    } finally {
      setExporting(false);
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0] ?? null;
    setPreviewFile(file);
    setPreview(null);
    setSnapshotDownloaded(false);
    setConfirmText('');
    setPassword('');
    setMessage(null);
    setError(null);
    if (!file) return;
    if (!context.csrfToken || !context.workspaceEpoch) {
      setError('登入狀態尚未就緒');
      return;
    }
    setPreviewing(true);
    try {
      const response = await fetch('/api/v1/backup/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': context.csrfToken,
          'X-Workspace-Epoch': context.workspaceEpoch
        },
        body: file
      });
      if (!response.ok) throw await readError(response);
      const body = (await response.json()) as ApiEnvelope<BackupPreviewDto>;
      setPreview(body.data);
      setMessage('備份已通過驗證；請下載目前資料備份後再確認還原。');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '備份預覽失敗');
    } finally {
      setPreviewing(false);
    }
  };

  const downloadCurrentSnapshot = async (): Promise<void> => {
    if (!preview) return;
    setError(null);
    try {
      const response = await fetch(`/api/v1/backup/export?restoreToken=${encodeURIComponent(preview.token)}`);
      if (!response.ok) throw await readError(response);
      saveBlob(await response.blob(), filenameFromResponse(response));
      setSnapshotDownloaded(true);
      setMessage('已提供目前資料備份下載；應用不宣稱已核實磁碟上的檔案。');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '下載目前備份失敗');
    }
  };

  const restore = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!previewFile || !preview) return;
    if (confirmText !== '還原') {
      setError('請輸入「還原」以確認');
      return;
    }
    if (!snapshotDownloaded) {
      setError('請先下載目前資料備份');
      return;
    }
    if (!context.csrfToken) {
      setError('登入狀態尚未就緒');
      return;
    }
    setRestoring(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', previewFile);
      form.append('token', preview.token);
      form.append('confirmText', confirmText);
      form.append('password', password);
      const response = await fetch('/api/v1/backup/restore', {
        method: 'POST',
        headers: { 'X-CSRF-Token': context.csrfToken },
        body: form
      });
      if (!response.ok) throw await readError(response);
      window.location.assign('/login?restored=1');
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '還原失敗');
      setRestoring(false);
    }
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>設定 · 備份 · 還原</p>
        <h1 className={ui.title}>設定</h1>
        <p className={ui.lede}>固定香港中文及 Asia/Hong_Kong 時區；匯出包含全部業務資料，但不包含登入密鑰、Session、migration 或實體附件。</p>
      </header>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>登入與固定設定</h2>
        <p className={ui.muted} style={{ marginTop: 8 }}>
          {settings.data
            ? `語言 ${settings.data.data.locale} · 時區 ${settings.data.data.timezone} · 每週由星期一開始`
            : '正在讀取設定…'}
        </p>
        <p className={ui.muted}>單一擁有者密碼登入；本版本沒有註冊、分享或第三方 AI 服務。</p>
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>資料匯出</h2>
          <span className={ui.muted}>UTF-8 JSON</span>
        </div>
        <p className={ui.muted}>一般手動匯出會建立一致性快照；檔名使用香港時間。連結指向的實體文件不會打包。</p>
        <div className={ui.actions} style={{ marginTop: 12 }}>
          <button className={ui.button} type="button" onClick={() => void exportNow()} disabled={exporting}>
            {exporting ? '匯出中…' : '下載完整備份'}
          </button>
        </div>
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>整體還原</h2>
          <span className={ui.muted}>取代全部業務資料</span>
        </div>
        <p className={ui.muted}>
          流程：上傳 → 完整驗證 → 比較數量 → 下載目前備份 → 輸入「還原」及密碼 → 原子取代。失敗會全部回復，不會合併匯入。
        </p>
        <div className={ui.field} style={{ marginTop: 12 }}>
          <label className={ui.label} htmlFor="restore-file">備份檔案（最多 20MB）</label>
          <input id="restore-file" type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event)} />
        </div>
        {previewing ? <PageStatus compact kind="loading" title="正在完整驗證備份…" /> : null}
        {preview ? (
          <div className={ui.form} style={{ marginTop: 16 }}>
            <p className={ui.success}>檔案已通過結構、外鍵、唯一約束及日期驗證。</p>
            <p className={ui.muted}>目前：{countLabel(preview.current)}</p>
            <p className={ui.muted}>匯入：{countLabel(preview.incoming)}</p>
            <p className={ui.muted}>預覽到期：{new Date(preview.expiresAt).toLocaleString('zh-HK')} · revision {preview.revision}</p>
            <p className={ui.muted}>檔案 SHA-256：<span style={{ overflowWrap: 'anywhere' }}>{preview.fileHash}</span></p>
            <div className={ui.actions}>
              <button className={`${ui.button} ${ui.secondary}`} type="button" onClick={() => void downloadCurrentSnapshot()}>
                下載目前資料備份
              </button>
              {snapshotDownloaded ? <span className={ui.success}>已提供下載</span> : null}
            </div>
            <form className={ui.form} onSubmit={(event) => void restore(event)}>
              <div className={ui.filterRow}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="restore-confirm">輸入「還原」</label>
                  <input id="restore-confirm" className={ui.input} value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="restore-password">登入密碼</label>
                  <input id="restore-password" className={ui.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
                </div>
              </div>
              <button className={`${ui.button} ${ui.danger}`} type="submit" disabled={restoring}>
                {restoring ? '還原中…' : '確認整體還原'}
              </button>
            </form>
          </div>
        ) : null}
      </section>

      {message ? <p className={ui.success}>{message}</p> : null}
      {error ? <p className={ui.error}>{error}</p> : null}

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>封存資料</h2>
          <span className={ui.muted}>{archivedItems.length} 項</span>
        </div>
        <p className={ui.muted}>封存的項目會暫時隱藏其任務；人物及獨立活動不隨項目消失。可在此逐項恢復。</p>
        {archivedItems.length === 0 ? <p className={ui.empty}>沒有封存資料。</p> : null}
        {archivedItems.length > 0 ? (
          <ul className={ui.list}>
            {archivedItems.map((item) => (
              <li key={`${item.path}-${item.id}`} className={ui.row}>
                <span className={ui.rowTitle}>{item.title}</span>
                <button className={`${ui.button} ${ui.secondary}`} type="button" style={{ alignSelf: 'flex-start' }} disabled={restoreArchived.isPending} onClick={() => restoreArchived.mutate(item)}>
                  恢復
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}