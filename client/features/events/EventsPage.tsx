import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiEnvelope, EventDto } from '@shared/api-types';
import { AREA_IDS, AREA_NAME_BY_ID } from '@shared/areas';
import { formatHongKongDateTime, formatHongKongShortDate, toHongKongDate } from '@shared/dates';
import { EVENT_KIND_LABELS, REGISTRATION_STATUS_LABELS } from '@shared/enums';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import { useEventsQuery, useWorkspaceInvalidate, useWriteContext } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

function toInstant(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

export function EventsPage() {
  const navigate = useNavigate();
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const events = useEventsQuery({ limit: '200', archived: 'exclude' });
  const [title, setTitle] = useState('');
  const [primaryAreaId, setPrimaryAreaId] = useState<string>('study');
  const [kind, setKind] = useState<EventDto['kind']>('other');
  const [allDay, setAllDay] = useState(false);
  const [startOn, setStartOn] = useState(toHongKongDate());
  const [endOn, setEndOn] = useState(toHongKongDate());
  const [startsAt, setStartsAt] = useState(`${toHongKongDate()}T10:00`);
  const [endsAt, setEndsAt] = useState(`${toHongKongDate()}T11:00`);
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState<EventDto['registrationStatus']>('not_needed');
  const [registrationDueOn, setRegistrationDueOn] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      if (!context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<EventDto>>('/events', {
        method: 'POST',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          title,
          primaryAreaId,
          kind,
          allDay,
          ...(allDay
            ? { startOn, endOn, startsAt: null, endsAt: null, timezone: null }
            : { startOn: null, endOn: null, startsAt: toInstant(startsAt), endsAt: toInstant(endsAt), timezone: 'Asia/Hong_Kong' }),
          location,
          url,
          registrationStatus,
          registrationDueOn: registrationDueOn || null,
          registrationDueAt: null,
          registrationDueTimezone: null,
          notes
        }
      });
    },
    onSuccess: async (response) => {
      setTitle('');
      setMessage('已新增活動');
      await invalidate();
      navigate(`/events/${response.data.id}`);
    }
  });

  const error =
    create.error instanceof ApiError
      ? create.error.fieldErrors?.title ?? create.error.message
      : create.error?.message;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!title.trim()) {
      setMessage('請輸入活動標題');
      return;
    }
    create.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>活動 · 出席 · 報名</p>
        <h1 className={ui.title}>活動</h1>
        <p className={ui.lede}>記錄課程、面試、聚會與對外活動；日曆會讀取活動及報名截止。</p>
      </header>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>新增活動</h2>
          <span className={ui.muted}>時間以香港時區輸入</span>
        </div>
        <form className={ui.form} onSubmit={submit}>
          <div className={ui.filterRow}>
            <div className={ui.field} style={{ flex: '2 1 280px' }}>
              <label className={ui.label} htmlFor="event-title">標題</label>
              <input id="event-title" className={ui.input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-area">主領域</label>
              <select id="event-area" className={ui.select} value={primaryAreaId} onChange={(e) => setPrimaryAreaId(e.target.value)}>
                {AREA_IDS.map((id) => <option key={id} value={id}>{AREA_NAME_BY_ID[id]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-kind">類型</label>
              <select id="event-kind" className={ui.select} value={kind} onChange={(e) => setKind(e.target.value as EventDto['kind'])}>
                {Object.entries(EVENT_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <label className={ui.checkboxRow}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            全天活動
          </label>
          <div className={ui.filterRow}>
            {allDay ? (
              <>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-start">開始日期</label>
                  <input id="event-start" type="date" className={ui.input} value={startOn} onChange={(e) => setStartOn(e.target.value)} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-end">結束日期</label>
                  <input id="event-end" type="date" className={ui.input} value={endOn} onChange={(e) => setEndOn(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-starts-at">開始時間</label>
                  <input id="event-starts-at" type="datetime-local" className={ui.input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-ends-at">結束時間</label>
                  <input id="event-ends-at" type="datetime-local" className={ui.input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </>
            )}
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-registration">報名狀態</label>
              <select id="event-registration" className={ui.select} value={registrationStatus} onChange={(e) => setRegistrationStatus(e.target.value as EventDto['registrationStatus'])}>
                {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-registration-due">報名截止日期</label>
              <input id="event-registration-due" type="date" className={ui.input} value={registrationDueOn} onChange={(e) => setRegistrationDueOn(e.target.value)} />
            </div>
          </div>
          <div className={ui.filterRow}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-location">地點</label>
              <input id="event-location" className={ui.input} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-url">連結</label>
              <input id="event-url" className={ui.input} type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="event-notes">備註</label>
            <textarea id="event-notes" className={ui.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={create.isPending}>
              {create.isPending ? '儲存中…' : '新增活動'}
            </button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>活動清單</h2>
          <span className={ui.muted}>{events.data?.meta?.total ?? 0} 項</span>
        </div>
        {events.isPending ? <PageStatus compact kind="loading" title="正在讀取活動…" /> : null}
        {events.isError ? <PageStatus compact kind="error" title="無法讀取活動" onRetry={() => void events.refetch()} /> : null}
        {events.data && events.data.data.length === 0 ? <p className={ui.empty}>還沒有活動。</p> : null}
        {events.data && events.data.data.length > 0 ? (
          <ul className={ui.list}>
            {events.data.data.map((event) => (
              <li key={event.id} className={ui.row}>
                <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={`/events/${event.id}`}>{event.title}</Link>
                <span className={ui.meta}>
                  <span className={ui.badge}>{EVENT_KIND_LABELS[event.kind]}</span>
                  <span>{AREA_NAME_BY_ID[event.primaryAreaId]}</span>
                  <span>{event.allDay ? `${formatHongKongShortDate(event.startOn ?? '')} – ${formatHongKongShortDate(event.endOn ?? '')}` : event.startsAt ? formatHongKongDateTime(event.startsAt) : '未設定時間'}</span>
                  <span>{REGISTRATION_STATUS_LABELS[event.registrationStatus]}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}