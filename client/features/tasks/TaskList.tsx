import { Link } from 'react-router-dom';
import type { TaskDto } from '@shared/api-types';
import { AREA_NAME_BY_ID } from '@shared/areas';
import {
  formatHongKongDateTime,
  formatHongKongShortDate
} from '@shared/dates';
import styles from './TaskList.module.css';

const STATUS_LABELS: Record<TaskDto['status'], string> = {
  todo: '待辦',
  doing: '進行中',
  waiting: '等待中',
  done: '已完成',
  cancelled: '已取消'
};

export interface TaskListProps {
  tasks: TaskDto[];
  emptyTitle: string;
  emptyDescription: string;
}

export function TaskList({ tasks, emptyTitle, emptyDescription }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>{emptyTitle}</p>
        <p className={styles.emptyDescription}>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {tasks.map((task) => (
        <li key={task.id} className={styles.item}>
          <span className={styles.marker} aria-hidden="true" />
          <div className={styles.content}>
            <p className={styles.title}>
              <Link to={`/tasks/${task.id}`} className={styles.titleLink}>
                {task.title}
              </Link>
            </p>
            <p className={styles.meta}>
              <span>{STATUS_LABELS[task.status]}</span>
              <span className={styles.separator} aria-hidden="true">
                ·
              </span>
              <span>
                {task.effectiveAreaId
                  ? AREA_NAME_BY_ID[task.effectiveAreaId]
                  : '未分類'}
              </span>
              {task.projectTitle ? (
                <>
                  <span className={styles.separator} aria-hidden="true">
                    ·
                  </span>
                  <span>{task.projectTitle}</span>
                </>
              ) : null}
              {task.plannedOn ? (
                <>
                  <span className={styles.separator} aria-hidden="true">
                    ·
                  </span>
                  <span>安排 {formatHongKongShortDate(task.plannedOn)}</span>
                </>
              ) : null}
              {task.dueOn ? (
                <>
                  <span className={styles.separator} aria-hidden="true">
                    ·
                  </span>
                  <span>截止 {formatHongKongShortDate(task.dueOn)}</span>
                </>
              ) : null}
              {task.dueAt ? (
                <>
                  <span className={styles.separator} aria-hidden="true">
                    ·
                  </span>
                  <span>截止 {formatHongKongDateTime(task.dueAt)}</span>
                </>
              ) : null}
              {task.followUpOn ? (
                <>
                  <span className={styles.separator} aria-hidden="true">
                    ·
                  </span>
                  <span>跟進 {formatHongKongShortDate(task.followUpOn)}</span>
                </>
              ) : null}
              <span className={styles.separator} aria-hidden="true">
                ·
              </span>
              <time dateTime={task.createdAt}>
                {formatHongKongDateTime(task.createdAt)} 建立
              </time>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
