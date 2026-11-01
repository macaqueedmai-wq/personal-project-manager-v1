import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ApiEnvelope, HealthEntryDto } from '@shared/api-types';
import { addDays, formatHongKongShortDate, toHongKongDate } from '@shared/dates';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useHealthQuery, useWorkspaceInvalidate, useWriteContext } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

const KIND_LABELS: Record<HealthEntryDto['kind'], string> = {
  exercise: '運動',
  sleep: '睡眠',
  note: '備註'
};

export function HealthPage() {
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const today = toHongKongDate();
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState('');
  const health = useHealthQuery({ from, to, kind, limit: '200' });
  const [localDate, setLocalDate] = useState(today);
  const [entryKind, setEntryKind] = useState<HealthEntryDto['kind']>('exercise');
  const [activityName, setActivityName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [sleepHours, setSleepHours] = useState('7');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<HealthEntryDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<HealthEntryDto>>('/health-entries', {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          localDate,
          kind: entryKind,
          activityName: entryKind === 'exercise' ? activityName || null : null,
          durationMinutes: entryKind === 'exercise' ? Number(durationMinutes) : null,
          sleepHours: entryKind === 'sleep' ? Number(sleepHours) : null,
          note
        }
      });
    },
    onSuccess: async () => {
      setActivityName('');
      setNote('');
      setMessage('已新增健康紀錄');
      await invalidate();
    }
  });

  const saveEdit = useMutation({
    mutationFn: () => {
      if (!editing || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<HealthEntryDto>>(`/health-entries/${editing.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          version: editing.version,
          localDate: editing.localDate,
          kind: editing.kind,
          activityName: editing.activityName,
          durationMinutes: editing.durationMinutes,
          sleepHours: editing.sleepHours,
          note: editing.note
        }
      });
    },
    onSuccess: async () => {
      setEditing(null);
      setMessage('已更新健康紀錄');
      await invalidate();
    }
  });

  const error = create.error instanceof ApiError ? create.error.message : create.error?.message;
  const editError = saveEdit.error instanceof ApiError ? saveEdit.error.message : saveEdit.error?.message;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>健康 · 運動 · 睡眠</p>
        <h1 className={ui.title}>健康紀錄</h1>
        <p className={ui.lede}>睡眠以醒來當日記錄；每日最多一筆睡眠。健康紀錄與習慣打卡互不自動修改。</p>
      </header>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>新增紀錄</h2>
        <form className={ui.form} onSubmit={submit} style={{ marginTop: 12 }}>
          <div className={ui.filterRow}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="health-date">日期</label>
              <input id="health-date" type="date" className={ui.input} value={localDate} max={today} onChange={(e) => setLocalDate(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="health-kind">類型</label>
              <select id="health-kind" className={ui.select} value={entryKind} onChange={(e) => setEntryKind(e.target.value as HealthEntryDto['kind'])}>
                {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            {entryKind === 'exercise' ? (
              <>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="health-activity">運動名稱</label>
                  <input id="health-activity" className={ui.input} value={activityName} onChange={(e) => setActivityName(e.target.value)} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="health-duration">時長（分鐘）</label>
                  <input id="health-duration" type="number" min="1" className={ui.input} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
                </div>
              </>
            ) : null}
            {entryKind === 'sleep' ? (
              <div className={ui.field}>
                <label className={ui.label} htmlFor="health-sleep">睡眠時數</label>
                <input id="health-sleep" type="number" min="0" max="24" step="0.25" className={ui.input} value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} />
              </div>
            ) : null}
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="health-note">備註</label>
            <textarea id="health-note" className={ui.textarea} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>{create.isPending ? '儲存中…' : '新增紀錄'}</button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.card}>
        <div className={ui.filterRow} style={{ marginBottom: 12 }}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="health-from">由</label>
            <input id="health-from" type="date" className={ui.input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="health-to">至</label>
            <input id="health-to" type="date" className={ui.input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="health-filter-kind">類型</label>
            <select id="health-filter-kind" className={ui.select} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">全部</option>
              {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        {health.isPending ? <PageStatus compact kind="loading" title="正在讀取健康紀錄…" /> : null}
        {health.isError ? <PageStatus compact kind="error" title="無法讀取健康紀錄" onRetry={() => void health.refetch()} /> : null}
        {health.data && health.data.data.length === 0 ? <p className={ui.empty}>這個範圍沒有健康紀錄。</p> : null}
        {health.data && health.data.data.length > 0 ? (
          <ul className={ui.list}>
            {health.data.data.map((entry) => (
              <li key={entry.id} className={ui.row}>
                <div className={ui.cardHeader} style={{ marginBottom: 0 }}>
                  <strong className={ui.rowTitle}>{KIND_LABELS[entry.kind]} · {formatHongKongShortDate(entry.localDate)}</strong>
                  <span className={ui.meta}>
                    {entry.durationMinutes ? <span>{entry.durationMinutes} 分鐘</span> : null}
                    {entry.sleepHours !== null ? <span>{entry.sleepHours} 小時</span> : null}
                    <button className={ui.inlineLink} type="button" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setEditing({ ...entry })}>修改</button>
                  </span>
                </div>
                {entry.activityName ? <span className={ui.muted}>{entry.activityName}</span> : null}
                {entry.note ? <p>{entry.note}</p> : null}
                {editing?.id === entry.id ? (
                  <div className={ui.form}>
                    <div className={ui.filterRow}>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor={`health-edit-duration-${entry.id}`}>時長（分鐘）</label>
                        <input id={`health-edit-duration-${entry.id}`} type="number" className={ui.input} value={editing.durationMinutes ?? ''} onChange={(e) => setEditing({ ...editing, durationMinutes: e.target.value ? Number(e.target.value) : null })} />
                      </div>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor={`health-edit-sleep-${entry.id}`}>睡眠時數</label>
                        <input id={`health-edit-sleep-${entry.id}`} type="number" className={ui.input} value={editing.sleepHours ?? ''} onChange={(e) => setEditing({ ...editing, sleepHours: e.target.value ? Number(e.target.value) : null })} />
                      </div>
                    </div>
                    <textarea className={ui.textarea} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
                    <div className={ui.actions}>
                      <button className={ui.button} type="button" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>儲存修改</button>
                      <button className={`${ui.button} ${ui.secondary}`} type="button" onClick={() => setEditing(null)}>取消</button>
                    </div>
                    {editError ? <p className={ui.error}>{editError}</p> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}