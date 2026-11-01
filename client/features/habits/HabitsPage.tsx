import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ApiEnvelope, HabitDto } from '@shared/api-types';
import {
  addDays,
  formatHongKongShortDate,
  isoWeekday,
  startOfHongKongWeek,
  toHongKongDate
} from '@shared/dates';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import {
  useHabitEntriesQuery,
  useHabitsQuery,
  useWorkspaceInvalidate,
  useWriteContext
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function HabitRow({ habit }: { habit: HabitDto }) {
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const today = toHongKongDate();
  const from = startOfHongKongWeek(today);
  const to = addDays(from, 6);
  const entries = useHabitEntriesQuery(habit.id, from, to);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(habit.title);
  const [scheduleType, setScheduleType] = useState<HabitDto['scheduleType']>(habit.scheduleType);
  const [weekdays, setWeekdays] = useState<number[]>(habit.weekdays);
  const [endOn, setEndOn] = useState(habit.endOn ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: ({ date, done }: { date: string; done: boolean }) => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      if (done) {
        return apiRequest<ApiEnvelope<unknown>>(`/habits/${habit.id}/entries/${date}`, {
          method: 'DELETE',
          csrfToken: context.csrfToken,
          workspaceEpoch: context.workspaceEpoch
        });
      }
      return apiRequest<ApiEnvelope<unknown>>(`/habits/${habit.id}/entries/${date}`, {
        method: 'PUT',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { status: 'done', note: '' }
      });
    },
    onSuccess: async () => {
      setMessage(null);
      await invalidate();
    },
    onError: (error) => setMessage(error instanceof ApiError ? error.message : '打卡失敗')
  });

  const save = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<HabitDto>>(`/habits/${habit.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          version: habit.version,
          title,
          scheduleType,
          weekdays: scheduleType === 'daily' ? [] : weekdays,
          endOn: endOn || null
        }
      });
    },
    onSuccess: async () => {
      setEditing(false);
      setMessage('已更新頻率');
      await invalidate();
    },
    onError: (error) => setMessage(error instanceof ApiError ? error.message : '更新失敗')
  });

  const archive = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<HabitDto>>(`/habits/${habit.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { version: habit.version, archived: true }
      });
    },
    onSuccess: async () => {
      await invalidate();
    }
  });

  const entriesByDate = new Map((entries.data?.data ?? []).map((entry) => [entry.localDate, entry]));
  const days = Array.from({ length: 7 }, (_value, index) => addDays(from, index));

  return (
    <li className={ui.row}>
      <div className={ui.cardHeader} style={{ marginBottom: 0 }}>
        <strong className={ui.rowTitle}>{habit.title}</strong>
        <span className={ui.meta}>
          <span className={ui.badge}>{habit.scheduleType === 'daily' ? '每日' : `每週 ${habit.weekdays.map((day) => WEEKDAY_LABELS[day - 1]).join('、')}`}</span>
          <span>由 {formatHongKongShortDate(habit.startOn)}</span>
          {habit.endOn ? <span>至 {formatHongKongShortDate(habit.endOn)}</span> : null}
        </span>
      </div>
      <div className={ui.habitDays}>
        {days.map((date) => {
          const entry = entriesByDate.get(date);
          const scheduled = habit.scheduleType === 'daily' || habit.weekdays.includes(isoWeekday(date));
          const outside = date < habit.startOn || (habit.endOn !== null && date > habit.endOn);
          const future = date > today;
          return (
            <button
              key={date}
              type="button"
              className={`${ui.habitDay} ${entry?.status === 'done' ? ui.habitDayDone : ''} ${
                !scheduled ? ui.habitDayExtra : ''
              } ${date === today ? ui.habitDayToday : ''}`}
              disabled={future || outside || toggle.isPending}
              title={`${date}${scheduled ? '' : '（補記）'}`}
              onClick={() => toggle.mutate({ date, done: entry?.status === 'done' })}
            >
              <span>{WEEKDAY_LABELS[isoWeekday(date) - 1]}</span>
              <small>{date.slice(5)}</small>
              <strong>{entry?.status === 'done' ? '✓' : entry?.status === 'skipped' ? '–' : scheduled ? '○' : '＋'}</strong>
            </button>
          );
        })}
      </div>
      {editing ? (
        <div className={ui.form}>
          <div className={ui.filterRow}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`habit-title-${habit.id}`}>名稱</label>
              <input id={`habit-title-${habit.id}`} className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`habit-schedule-${habit.id}`}>頻率</label>
              <select id={`habit-schedule-${habit.id}`} className={ui.select} value={scheduleType} onChange={(e) => setScheduleType(e.target.value as HabitDto['scheduleType'])}>
                <option value="daily">每日</option>
                <option value="weekly">每週</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor={`habit-end-${habit.id}`}>結束日期</label>
              <input id={`habit-end-${habit.id}`} type="date" className={ui.input} value={endOn} onChange={(e) => setEndOn(e.target.value)} />
            </div>
          </div>
          {scheduleType === 'weekly' ? (
            <div className={ui.checkboxRow}>
              {WEEKDAY_LABELS.map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(index + 1)}
                    onChange={(e) =>
                      setWeekdays((current) =>
                        e.target.checked ? [...current, index + 1] : current.filter((day) => day !== index + 1)
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : null}
          <div className={ui.actions}>
            <button className={ui.button} type="button" disabled={save.isPending} onClick={() => save.mutate()}>儲存頻率</button>
            <button className={`${ui.button} ${ui.secondary}`} type="button" onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      ) : null}
      <div className={ui.actions}>
        <button className={`${ui.button} ${ui.secondary}`} type="button" onClick={() => setEditing(!editing)}>{editing ? '收起編輯' : '編輯頻率'}</button>
        <button className={`${ui.button} ${ui.danger}`} type="button" onClick={() => archive.mutate()} disabled={archive.isPending}>封存習慣</button>
        {message ? <span className={ui.muted}>{message}</span> : null}
      </div>
      {entries.isError ? <p className={ui.error}>無法讀取本週打卡紀錄。</p> : null}
    </li>
  );
}

export function HabitsPage() {
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const habits = useHabitsQuery({ archived: 'exclude', limit: '200' });
  const [title, setTitle] = useState('');
  const [scheduleType, setScheduleType] = useState<HabitDto['scheduleType']>('daily');
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [startOn, setStartOn] = useState(toHongKongDate());
  const [endOn, setEndOn] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<HabitDto>>('/habits', {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          title,
          scheduleType,
          weekdays: scheduleType === 'daily' ? [] : weekdays,
          startOn,
          endOn: endOn || null
        }
      });
    },
    onSuccess: async () => {
      setTitle('');
      setMessage('已新增習慣');
      await invalidate();
    }
  });

  const error = create.error instanceof ApiError ? create.error.message : create.error?.message;
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!title.trim()) {
      setMessage('請輸入習慣名稱');
      return;
    }
    create.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>習慣 · 打卡 · 歷史</p>
        <h1 className={ui.title}>習慣</h1>
        <p className={ui.lede}>打卡使用冪等 PUT；同一習慣同一日最多一筆。補記只保存為當日紀錄，不宣稱原本已排定。</p>
      </header>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>新增習慣</h2>
        <form className={ui.form} onSubmit={submit} style={{ marginTop: 12 }}>
          <div className={ui.filterRow}>
            <div className={ui.field} style={{ flex: '2 1 240px' }}>
              <label className={ui.label} htmlFor="habit-new-title">名稱</label>
              <input id="habit-new-title" className={ui.input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="habit-new-schedule">頻率</label>
              <select id="habit-new-schedule" className={ui.select} value={scheduleType} onChange={(e) => setScheduleType(e.target.value as HabitDto['scheduleType'])}>
                <option value="daily">每日</option>
                <option value="weekly">每週</option>
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="habit-new-start">開始日期</label>
              <input id="habit-new-start" type="date" className={ui.input} value={startOn} onChange={(e) => setStartOn(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="habit-new-end">結束日期（可空）</label>
              <input id="habit-new-end" type="date" className={ui.input} value={endOn} onChange={(e) => setEndOn(e.target.value)} />
            </div>
          </div>
          {scheduleType === 'weekly' ? (
            <div className={ui.checkboxRow}>
              {WEEKDAY_LABELS.map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(index + 1)}
                    onChange={(e) => setWeekdays((current) => e.target.checked ? [...current, index + 1] : current.filter((day) => day !== index + 1))}
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : null}
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>{create.isPending ? '儲存中…' : '新增習慣'}</button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>本週打卡</h2>
          <span className={ui.muted}>點擊日期切換完成；未排定日期可補記</span>
        </div>
        {habits.isPending ? <PageStatus compact kind="loading" title="正在讀取習慣…" /> : null}
        {habits.isError ? <PageStatus compact kind="error" title="無法讀取習慣" onRetry={() => void habits.refetch()} /> : null}
        {habits.data && habits.data.data.length === 0 ? <p className={ui.empty}>還沒有習慣。</p> : null}
        {habits.data && habits.data.data.length > 0 ? (
          <ul className={ui.list}>
            {habits.data.data.map((habit) => <HabitRow key={habit.id} habit={habit} />)}
          </ul>
        ) : null}
      </section>
    </div>
  );
}