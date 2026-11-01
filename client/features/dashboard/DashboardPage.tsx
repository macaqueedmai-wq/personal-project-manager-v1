import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardTaskItem } from '@shared/api-types';
import {
  formatHongKongDateLabel,
  formatHongKongDateTime,
  formatHongKongShortDate
} from '@shared/dates';
import { TASK_STATUS_LABELS } from '@shared/enums';
import { PageStatus } from '../../components/PageStatus';
import { AreaReference } from '../areas/AreaReference';
import { useDashboardQuery, useTasksQuery } from '../workspace/hooks';
import { QuickAdd } from '../tasks/QuickAdd';
import { TaskList } from '../tasks/TaskList';
import { FocusEditor } from './FocusEditor';
import ui from '../../components/ui.module.css';

function DashboardTaskRows({ items }: { items: DashboardTaskItem[] }) {
  if (items.length === 0) {
    return <p className={ui.empty}>今天沒有安排或到期的任務。</p>;
  }

  return (
    <ul className={ui.list}>
      {items.map(({ task, reasons }) => (
        <li key={task.id} className={ui.row}>
          <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={`/tasks/${task.id}`}>
            {task.title}
          </Link>
          <span className={ui.meta}>
            {reasons.includes('planned') ? <span className={ui.badge}>已安排</span> : null}
            {reasons.includes('due') ? (
              <span className={`${ui.badge} ${ui.badgeMuted}`}>到期</span>
            ) : null}
            <span>{TASK_STATUS_LABELS[task.status]}</span>
            {task.plannedOn ? <span>安排 {formatHongKongShortDate(task.plannedOn)}</span> : null}
            {task.dueOn ? <span>截止 {formatHongKongShortDate(task.dueOn)}</span> : null}
            {task.dueAt ? <span>截止 {formatHongKongDateTime(task.dueAt)}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InboxPage() {
  const tasks = useTasksQuery({ limit: '200' });
  const visible = useMemo(
    () =>
      (tasks.data?.data ?? []).filter(
        (task) =>
          !task.projectId &&
          !task.areaId &&
          task.status !== 'done' &&
          task.status !== 'cancelled'
      ),
    [tasks.data?.data]
  );

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>未分類 · 未完成</p>
        <h1 className={ui.title}>收件箱</h1>
        <p className={ui.lede}>
          所有未歸類、未完成的任務都在這裡。只填標題也可以先記下。
        </p>
      </header>
      <QuickAdd />
      <section className={ui.card}>
        <div className={ui.cardHeader}>
          <h2 className={ui.sectionTitle}>未分類任務</h2>
          <span className={ui.muted}>共 {visible.length} 項</span>
        </div>
        {tasks.isPending ? <PageStatus compact kind="loading" title="正在讀取任務…" /> : null}
        {tasks.isError ? (
          <PageStatus compact kind="error" title="無法讀取任務" onRetry={() => void tasks.refetch()} />
        ) : null}
        {tasks.data ? (
          <TaskList
            tasks={visible}
            emptyTitle="收件箱是空的"
            emptyDescription="用上方的快速新增記下第一件事；未分類的任務會留在這裡。"
          />
        ) : null}
      </section>
    </div>
  );
}

export interface DashboardPageProps {
  mode?: 'today' | 'inbox';
}

export function DashboardPage({ mode = 'today' }: DashboardPageProps) {
  if (mode === 'inbox') {
    return <InboxPage />;
  }

  const [view, setView] = useState<'today' | 'week'>('today');
  const dashboard = useDashboardQuery();

  if (dashboard.isPending) {
    return <PageStatus kind="loading" title="正在準備今日總覽…" />;
  }
  if (dashboard.isError || !dashboard.data) {
    return (
      <PageStatus
        kind="error"
        title="無法讀取總覽"
        description="請確認 API 與 PostgreSQL 仍在運行。"
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const data = dashboard.data.data;
  const items = view === 'today' ? data.todayTasks : data.weekTasks;
  const candidates = [...data.todayTasks, ...data.weekTasks];

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <p className={ui.eyebrow}>今日 · 香港時間</p>
        <h1 className={ui.title}>總覽</h1>
        <p className={ui.lede}>{formatHongKongDateLabel(data.today)}</p>
        <div className={ui.actions}>
          <button
            type="button"
            className={`${ui.button} ${view === 'today' ? '' : ui.secondary}`}
            onClick={() => setView('today')}
          >
            今日
          </button>
          <button
            type="button"
            className={`${ui.button} ${view === 'week' ? '' : ui.secondary}`}
            onClick={() => setView('week')}
          >
            本週
          </button>
          <Link className={`${ui.button} ${ui.secondary}`} to="/tasks">
            所有任務
          </Link>
        </div>
      </header>

      <QuickAdd />

      <div className={ui.split}>
        <div className={ui.grid} style={{ gap: 20 }}>
          <section className={ui.card} aria-labelledby="schedule-heading">
            <div className={ui.cardHeader}>
              <h2 id="schedule-heading" className={ui.sectionTitle}>
                {view === 'today' ? '今日安排與到期' : '本週安排與到期'}
              </h2>
              <span className={ui.muted}>
                {view === 'today'
                  ? `${data.weekStart} 至 ${data.weekEnd}`
                  : `本週 ${data.weekStart} 至 ${data.weekEnd}`}
              </span>
            </div>
            <DashboardTaskRows items={items} />
          </section>

          <section className={ui.card} aria-labelledby="upcoming-heading">
            <div className={ui.cardHeader}>
              <h2 id="upcoming-heading" className={ui.sectionTitle}>
                未來七日截止
              </h2>
              <span className={ui.muted}>{data.upcoming.length} 項</span>
            </div>
            {data.upcoming.length === 0 ? (
              <p className={ui.empty}>未來七日沒有任務、項目或申請截止。</p>
            ) : (
              <ul className={ui.list}>
                {data.upcoming.map((item) => (
                  <li key={`${item.type}-${item.id}-${item.date}`} className={ui.row}>
                    <Link
                      className={`${ui.rowTitle} ${ui.rowLink}`}
                      to={
                        item.type === 'task'
                          ? `/tasks/${item.id}`
                          : item.type === 'event'
                            ? `/events/${item.id}`
                            : `/projects/${item.id}`
                      }
                    >
                      {item.title}
                    </Link>
                    <span className={ui.meta}>
                      <span className={ui.badge}>{item.meta}</span>
                      {item.date ? (
                        <span>{formatHongKongShortDate(item.date)}</span>
                      ) : null}
                      {item.dateTime ? <span>{formatHongKongDateTime(item.dateTime)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={ui.card} aria-labelledby="waiting-heading">
            <div className={ui.cardHeader}>
              <h2 id="waiting-heading" className={ui.sectionTitle}>
                等待與跟進
              </h2>
              <span className={ui.muted}>{data.waiting.length} 項</span>
            </div>
            {data.waiting.length === 0 ? (
              <p className={ui.empty}>目前沒有等待中的任務或申請。</p>
            ) : (
              <ul className={ui.list}>
                {data.waiting.map((item) => (
                  <li key={`${item.type}-${item.id}`} className={ui.row}>
                    <Link
                      className={`${ui.rowTitle} ${ui.rowLink}`}
                      to={
                        item.type === 'task'
                          ? `/tasks/${item.id}`
                          : item.type === 'contact'
                            ? `/contacts/${item.id}`
                            : `/projects/${item.id}`
                      }
                    >
                      {item.title}
                    </Link>
                    <span className={ui.meta}>
                      {item.overdue ? <span className={ui.badge}>已到期</span> : null}
                      <span>{item.meta}</span>
                      <span>
                        {item.followUpOn
                          ? `跟進 ${formatHongKongShortDate(item.followUpOn)}`
                          : '等待中，未安排跟進'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className={ui.grid} style={{ gap: 20 }}>
          <FocusEditor
            date={data.today}
            version={data.focusVersion}
            focusTasks={data.focus}
            candidates={candidates}
          />
          <AreaReference />
          <section className={ui.card}>
            <div className={ui.cardHeader}>
              <h2 className={ui.sectionTitle}>今日活動</h2>
              <Link className={ui.inlineLink} to="/events">全部</Link>
            </div>
            {data.events.length === 0 ? (
              <p className={ui.empty}>今天沒有活動。</p>
            ) : (
              <ul className={ui.list}>
                {data.events.map((event) => (
                  <li key={event.id} className={ui.row}>
                    <Link className={`${ui.rowTitle} ${ui.rowLink}`} to={`/events/${event.id}`}>
                      {event.title}
                    </Link>
                    <span className={ui.meta}>
                      <span>{event.location || '未設定地點'}</span>
                      {event.startsAt ? <span>{formatHongKongDateTime(event.startsAt)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={ui.card}>
            <div className={ui.cardHeader}>
              <h2 className={ui.sectionTitle}>今日習慣</h2>
              <Link className={ui.inlineLink} to="/habits">打卡</Link>
            </div>
            {data.habits.length === 0 ? (
              <p className={ui.empty}>今天沒有排定的習慣。</p>
            ) : (
              <ul className={ui.list}>
                {data.habits.map((habit) => (
                  <li key={habit.id} className={ui.row}>
                    <Link className={`${ui.rowTitle} ${ui.rowLink}`} to="/habits">
                      {habit.title}
                    </Link>
                    <span className={ui.meta}>
                      {habit.scheduleType === 'daily' ? '每日' : '每週'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
