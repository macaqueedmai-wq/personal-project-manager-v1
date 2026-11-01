import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ApiEnvelope, EventDto } from '@shared/api-types';
import { AREA_IDS, AREA_NAME_BY_ID } from '@shared/areas';
import { toHongKongDate } from '@shared/dates';
import {
  ATTENDANCE_STATUS_LABELS,
  EVENT_KIND_LABELS,
  REGISTRATION_STATUS_LABELS
} from '@shared/enums';
import { ApiError, apiRequest } from '../../api/client';
import { PageStatus } from '../../components/PageStatus';
import {
  useContactsQuery,
  useEventQuery,
  useWorkspaceInvalidate,
  useWriteContext
} from '../workspace/hooks';
import ui from '../../components/ui.module.css';

function toLocalInput(instant: string | null): string {
  if (!instant) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(instant));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function toInstant(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const context = useWriteContext();
  const invalidate = useWorkspaceInvalidate();
  const event = useEventQuery(id);
  const [form, setForm] = useState<EventDto | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [relatedAreaIds, setRelatedAreaIds] = useState<string[]>([]);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const contacts = useContactsQuery({ limit: '200' });

  useEffect(() => {
    if (!event.data) return;
    setForm(event.data.data);
    setStartsAt(toLocalInput(event.data.data.startsAt));
    setEndsAt(toLocalInput(event.data.data.endsAt));
    setRelatedAreaIds(event.data.data.relatedAreaIds ?? []);
    setContactIds(event.data.data.contactIds ?? []);
  }, [event.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<EventDto>>(`/events/${form.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: {
          version: form.version,
          title: form.title,
          description: form.description,
          primaryAreaId: form.primaryAreaId,
          projectId: form.projectId,
          kind: form.kind,
          location: form.location,
          url: form.url,
          allDay: form.allDay,
          ...(form.allDay
            ? { startOn: form.startOn, endOn: form.endOn, startsAt: null, endsAt: null, timezone: null }
            : { startOn: null, endOn: null, startsAt: toInstant(startsAt), endsAt: toInstant(endsAt), timezone: 'Asia/Hong_Kong' }),
          registrationStatus: form.registrationStatus,
          registrationDueOn: form.registrationDueOn,
          registrationDueAt: form.registrationDueAt,
          registrationDueTimezone: form.registrationDueTimezone,
          attendanceStatus: form.attendanceStatus,
          notes: form.notes,
          tags: form.tags
        }
      });
    },
    onSuccess: async (response) => {
      setForm(response.data);
      setMessage('已儲存');
      await invalidate();
    }
  });

  const saveRelations = useMutation({
    mutationFn: async () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      let version = form.version;
      const currentAreas = form.relatedAreaIds ?? [];
      const currentContacts = form.contactIds ?? [];
      if (JSON.stringify([...relatedAreaIds].sort()) !== JSON.stringify([...currentAreas].sort())) {
        await apiRequest(`/events/${form.id}/related-areas`, {
          method: 'PUT',
          csrfToken: context.csrfToken,
          workspaceEpoch: context.workspaceEpoch,
          body: { version, areaIds: relatedAreaIds }
        });
        const latest = await apiRequest<ApiEnvelope<EventDto>>(`/events/${form.id}`);
        version = latest.data.version;
      }
      if (JSON.stringify([...contactIds].sort()) !== JSON.stringify([...currentContacts].sort())) {
        await apiRequest(`/events/${form.id}/contacts`, {
          method: 'PUT',
          csrfToken: context.csrfToken,
          workspaceEpoch: context.workspaceEpoch,
          body: { version, contactIds }
        });
      }
    },
    onSuccess: async () => {
      setMessage('已儲存相關領域及人物');
      await invalidate();
    }
  });

  const archive = useMutation({
    mutationFn: () => {
      if (!form || !context.csrfToken || !context.workspaceEpoch) throw new Error('登入狀態尚未就緒');
      return apiRequest<ApiEnvelope<EventDto>>(`/events/${form.id}`, {
        method: 'PATCH',
        csrfToken: context.csrfToken,
        workspaceEpoch: context.workspaceEpoch,
        body: { version: form.version, archived: true }
      });
    },
    onSuccess: async () => {
      await invalidate();
      navigate('/events');
    }
  });

  if (event.isPending) return <PageStatus kind="loading" title="正在讀取活動…" />;
  if (event.isError || !form) {
    return <PageStatus kind="error" title="找不到活動" onRetry={() => void event.refetch()} />;
  }

  const error =
    save.error instanceof ApiError ? save.error.message : save.error?.message;
  const update = (patch: Partial<EventDto>): void => setForm({ ...form, ...patch });
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>活動詳情</p>
        <h1 className={ui.title}>{form.title}</h1>
        <div className={ui.actions}>
          <Link className={`${ui.button} ${ui.secondary}`} to="/events">返回活動</Link>
          <Link className={`${ui.button} ${ui.secondary}`} to="/calendar">看日曆</Link>
        </div>
      </header>

      <section className={ui.card}>
        <form className={ui.form} onSubmit={submit}>
          <div className={ui.filterRow}>
            <div className={ui.field} style={{ flex: '2 1 260px' }}>
              <label className={ui.label} htmlFor="event-edit-title">標題</label>
              <input id="event-edit-title" className={ui.input} value={form.title} onChange={(e) => update({ title: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-edit-area">主領域</label>
              <select id="event-edit-area" className={ui.select} value={form.primaryAreaId} onChange={(e) => update({ primaryAreaId: e.target.value as EventDto['primaryAreaId'] })}>
                {AREA_IDS.map((area) => <option key={area} value={area}>{AREA_NAME_BY_ID[area]}</option>)}
              </select>
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-edit-kind">類型</label>
              <select id="event-edit-kind" className={ui.select} value={form.kind} onChange={(e) => update({ kind: e.target.value as EventDto['kind'] })}>
                {Object.entries(EVENT_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <label className={ui.checkboxRow}>
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => {
                const nextAllDay = e.target.checked;
                update({
                  allDay: nextAllDay,
                  ...(nextAllDay
                    ? {
                        startOn: form.startOn ?? toHongKongDate(),
                        endOn: form.endOn ?? form.startOn ?? toHongKongDate()
                      }
                    : { startsAt: form.startsAt ?? new Date().toISOString(), endsAt: form.endsAt ?? new Date(Date.now() + 3600000).toISOString() })
                });
                if (!nextAllDay && !startsAt) {
                  setStartsAt(toLocalInput(new Date().toISOString()));
                  setEndsAt(toLocalInput(new Date(Date.now() + 3600000).toISOString()));
                }
              }}
            />
            全天活動
          </label>
          <div className={ui.filterRow}>
            {form.allDay ? (
              <>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-edit-start-on">開始日期</label>
                  <input id="event-edit-start-on" type="date" className={ui.input} value={form.startOn ?? toHongKongDate()} onChange={(e) => update({ startOn: e.target.value })} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-edit-end-on">結束日期</label>
                  <input id="event-edit-end-on" type="date" className={ui.input} value={form.endOn ?? form.startOn ?? toHongKongDate()} onChange={(e) => update({ endOn: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-edit-start">開始</label>
                  <input id="event-edit-start" type="datetime-local" className={ui.input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="event-edit-end">結束</label>
                  <input id="event-edit-end" type="datetime-local" className={ui.input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </div>
              </>
            )}
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-edit-attendance">出席狀態</label>
              <select id="event-edit-attendance" className={ui.select} value={form.attendanceStatus} onChange={(e) => update({ attendanceStatus: e.target.value as EventDto['attendanceStatus'] })}>
                {Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className={ui.filterRow}>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-edit-location">地點</label>
              <input id="event-edit-location" className={ui.input} value={form.location} onChange={(e) => update({ location: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-edit-url">連結</label>
              <input id="event-edit-url" className={ui.input} type="url" value={form.url} onChange={(e) => update({ url: e.target.value })} />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="event-edit-registration">報名狀態</label>
              <select id="event-edit-registration" className={ui.select} value={form.registrationStatus} onChange={(e) => update({ registrationStatus: e.target.value as EventDto['registrationStatus'] })}>
                {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="event-edit-registration-due">報名截止日期</label>
            <input id="event-edit-registration-due" type="date" className={ui.input} value={form.registrationDueOn ?? ''} onChange={(e) => update({ registrationDueOn: e.target.value || null })} />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="event-edit-notes">備註</label>
            <textarea id="event-edit-notes" className={ui.textarea} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
          </div>
          <div className={ui.actions}>
            <button className={ui.button} type="submit" disabled={save.isPending}>{save.isPending ? '儲存中…' : '儲存'}</button>
            <button className={`${ui.button} ${ui.danger}`} type="button" disabled={archive.isPending} onClick={() => archive.mutate()}>封存活動</button>
            {message ? <span className={ui.muted}>{message}</span> : null}
          </div>
          {error ? <p className={ui.error}>{error}</p> : null}
        </form>
      </section>

      <section className={ui.card}>
        <h2 className={ui.sectionTitle}>相關領域與人物</h2>
        <p className={ui.muted} style={{ marginTop: 6 }}>相關領域不可包含主領域；人物與活動可雙向查看。</p>
        <div className={ui.checkboxRow} style={{ marginTop: 12 }}>
          {AREA_IDS.filter((area) => area !== form.primaryAreaId).map((area) => (
            <label key={area}>
              <input
                type="checkbox"
                checked={relatedAreaIds.includes(area)}
                onChange={(e) =>
                  setRelatedAreaIds((current) =>
                    e.target.checked ? [...current, area] : current.filter((id) => id !== area)
                  )
                }
              />
              {AREA_NAME_BY_ID[area]}
            </label>
          ))}
        </div>
        <div className={ui.checkboxRow} style={{ marginTop: 12 }}>
          {(contacts.data?.data ?? []).map((contact) => (
            <label key={contact.id}>
              <input
                type="checkbox"
                checked={contactIds.includes(contact.id)}
                onChange={(e) =>
                  setContactIds((current) =>
                    e.target.checked
                      ? [...current, contact.id]
                      : current.filter((id) => id !== contact.id)
                  )
                }
              />
              {contact.name}
            </label>
          ))}
        </div>
        <div className={ui.actions} style={{ marginTop: 12 }}>
          <button className={`${ui.button} ${ui.secondary}`} type="button" disabled={saveRelations.isPending} onClick={() => saveRelations.mutate()}>
            {saveRelations.isPending ? '儲存中…' : '儲存關聯'}
          </button>
        </div>
        {saveRelations.error ? <p className={ui.error}>{saveRelations.error.message}</p> : null}
      </section>
    </div>
  );
}