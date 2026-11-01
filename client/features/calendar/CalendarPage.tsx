import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CalendarOccurrence } from '@shared/api-types';
import { AREA_IDS, AREA_NAME_BY_ID } from '@shared/areas';
import {
  formatHongKongDateTime,
  formatHongKongShortDate,
  toHongKongDate
} from '@shared/dates';
import { PageStatus } from '../../components/PageStatus';
import { useCalendarQuery } from '../workspace/hooks';
import ui from '../../components/ui.module.css';

function monthStart(month: string): string {
  return `${month}-01`;
}

function monthGrid(month: string): string[] {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const days: string[] = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(first);
    day.setUTCDate(1 - mondayOffset + index);
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

function monthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Intl.DateTimeFormat('zh-HK', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function occurrenceLink(occurrence: CalendarOccurrence): string {
  switch (occurrence.sourceType) {
    case 'task':
      return `/tasks/${occurrence.sourceId}`;
    case 'event':
      return `/events/${occurrence.sourceId}`;
    case 'contact':
      return `/contacts/${occurrence.sourceId}`;
    case 'application':
      return `/projects/${occurrence.projectId ?? occurrence.sourceId}`;
    default:
      return `/projects/${occurrence.sourceId}`;
  }
}

function itemLabel(occurrence: CalendarOccurrence): string {
  if (occurrence.occurrenceTypes.includes('registrationDue')) return '報名截止';
  if (occurrence.occurrenceTypes.includes('applicationDeadline')) return '申請截止';
  if (occurrence.occurrenceTypes.includes('projectDue')) return '項目截止';
  if (occurrence.occurrenceTypes.includes('followUp')) return '跟進';
  if (occurrence.occurrenceTypes.includes('contactFollowUp')) return '聯絡';
  if (occurrence.occurrenceTypes.includes('planned') && occurrence.occurrenceTypes.includes('due')) {
    return '安排 + 截止';
  }
  if (occurrence.occurrenceTypes.includes('due')) return '截止';
  if (occurrence.occurrenceTypes.includes('planned')) return '安排';
  return '活動';
}

export function CalendarPage() {
  const [month, setMonth] = useState(toHongKongDate().slice(0, 7));
  const [areaId, setAreaId] = useState('');
  const days = useMemo(() => monthGrid(month), [month]);
  const from = days[0] ?? monthStart(month);
  const to = days[days.length - 1] ?? monthStart(month);
  const calendar = useCalendarQuery({ from, to, areaId });
  const today = toHongKongDate();

  const occurrences = calendar.data?.data ?? [];
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const occurrence of occurrences) {
      let cursor = occurrence.startOn;
      while (cursor <= occurrence.endOn) {
        const list = map.get(cursor) ?? [];
        list.push(occurrence);
        map.set(cursor, list);
        const date = new Date(`${cursor}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 1);
        cursor = date.toISOString().slice(0, 10);
      }
    }
    return map;
  }, [occurrences]);

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>時間 · 香港時區</p>
        <h1 className={ui.title}>日曆</h1>
        <p className={ui.lede}>
          合併活動、任務安排／截止、項目及申請截止、聯絡提醒；同一任務同日安排與截止只顯示一次。
        </p>
      </header>

      <section className={ui.card}>
        <div className={ui.filterRow} style={{ marginBottom: 16 }}>
          <button type="button" className={`${ui.button} ${ui.secondary}`} onClick={() => setMonth(shiftMonth(month, -1))}>
            上個月
          </button>
          <strong style={{ minWidth: 140, textAlign: 'center' }}>{monthLabel(month)}</strong>
          <button type="button" className={`${ui.button} ${ui.secondary}`} onClick={() => setMonth(shiftMonth(month, 1))}>
            下個月
          </button>
          <button type="button" className={`${ui.button} ${ui.secondary}`} onClick={() => setMonth(today.slice(0, 7))}>
            回到本月
          </button>
          <div className={ui.field} style={{ marginLeft: 'auto' }}>
            <label className={ui.label} htmlFor="calendar-area">
              領域
            </label>
            <select
              id="calendar-area"
              className={ui.select}
              value={areaId}
              onChange={(event) => setAreaId(event.target.value)}
            >
              <option value="">全部領域</option>
              {AREA_IDS.map((id) => (
                <option key={id} value={id}>
                  {AREA_NAME_BY_ID[id]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {calendar.isPending ? <PageStatus compact kind="loading" title="正在讀取日曆…" /> : null}
        {calendar.isError ? (
          <PageStatus compact kind="error" title="無法讀取日曆" onRetry={() => void calendar.refetch()} />
        ) : null}
        {calendar.data ? (
          <div className={ui.calendar}>
            {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
              <div key={weekday} className={ui.calendarWeekday}>
                {weekday}
              </div>
            ))}
            {days.map((day) => {
              const inMonth = day.startsWith(month);
              const items = byDate.get(day) ?? [];
              return (
                <div
                  key={day}
                  className={`${ui.calendarCell} ${inMonth ? '' : ui.calendarOutside} ${
                    day === today ? ui.calendarToday : ''
                  }`}
                >
                  <span className={ui.calendarDate}>{Number(day.slice(8, 10))}</span>
                  <div className={ui.calendarItems}>
                    {items.slice(0, 4).map((item) => (
                      <Link
                        key={`${day}-${item.key}`}
                        to={occurrenceLink(item)}
                        className={`${ui.calendarItem} ${item.completed ? ui.calendarDone : ''}`}
                        title={`${item.title} · ${itemLabel(item)}`}
                      >
                        <span>{item.title}</span>
                        <small>{itemLabel(item)}</small>
                      </Link>
                    ))}
                    {items.length > 4 ? <span className={ui.muted}>+{items.length - 4} 項</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>本月項目</h2>
          <span className={ui.muted}>{occurrences.length} 項</span>
        </div>
        {occurrences.length === 0 ? (
          <p className={ui.empty}>這個範圍沒有活動或截止事項。</p>
        ) : (
          <ul className={ui.list}>
            {occurrences.slice(0, 80).map((item) => (
              <li key={item.key} className={ui.row}>
                <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={occurrenceLink(item)}>
                  {item.title}
                </Link>
                <span className={ui.meta}>
                  <span className={ui.badge}>{itemLabel(item)}</span>
                  <span>
                    {item.startOn === item.endOn
                      ? formatHongKongShortDate(item.startOn)
                      : `${formatHongKongShortDate(item.startOn)} – ${formatHongKongShortDate(item.endOn)}`}
                  </span>
                  {item.startsAt ? <span>{formatHongKongDateTime(item.startsAt)}</span> : null}
                  {item.areaId ? <span>{AREA_NAME_BY_ID[item.areaId]}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}