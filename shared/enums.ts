export const TASK_STATUSES = ['todo', 'doing', 'waiting', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_KINDS = [
  'general',
  'course',
  'degree_application',
  'job_application'
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待辦',
  doing: '進行中',
  waiting: '等待中',
  done: '已完成',
  cancelled: '已取消'
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '進行中',
  paused: '暫停',
  completed: '已完成',
  cancelled: '已取消'
};

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  general: '一般項目',
  course: '課程',
  degree_application: '申博申碩',
  job_application: '求職／實習'
};

export const APPLICATION_TYPES = ['degree', 'job'] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

export const APPLICATION_STAGES = [
  'exploring',
  'preparing',
  'submitted',
  'assessment',
  'interview',
  'decision',
  'closed'
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLICATION_STAGE_LABELS: Record<ApplicationStage, string> = {
  exploring: '探索中',
  preparing: '準備中',
  submitted: '已提交',
  assessment: '評核中',
  interview: '面試中',
  decision: '等待結果',
  closed: '已結束'
};

export const APPLICATION_OUTCOMES = [
  'offered',
  'accepted',
  'rejected',
  'withdrawn',
  'declined',
  'unknown'
] as const;
export type ApplicationOutcome = (typeof APPLICATION_OUTCOMES)[number];

export const APPLICATION_OUTCOME_LABELS: Record<ApplicationOutcome, string> = {
  offered: '已錄取',
  accepted: '已接受',
  rejected: '未獲取錄',
  withdrawn: '已撤回',
  declined: '已拒絕',
  unknown: '結果未明'
};

export const DEGREE_LEVELS = ['master', 'phd'] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];

export const WORK_TYPES = ['full_time', 'internship'] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export function isValidOutcomeForStage(
  stage: ApplicationStage,
  outcome: ApplicationOutcome | null
): boolean {
  if (stage === 'closed') {
    return outcome !== null;
  }
  if (stage === 'decision') {
    return outcome === null || outcome === 'offered';
  }
  return outcome === null;
}

export const EVENT_KINDS = [
  'class',
  'interview',
  'meeting',
  'exercise',
  'social',
  'outreach',
  'other'
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  class: '課堂',
  interview: '面試',
  meeting: '會面',
  exercise: '運動',
  social: '社交',
  outreach: '外展',
  other: '其他'
};

export const REGISTRATION_STATUSES = [
  'not_needed',
  'interested',
  'applied',
  'confirmed',
  'waitlisted',
  'rejected',
  'cancelled'
] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  not_needed: '無需報名',
  interested: '有興趣',
  applied: '已報名',
  confirmed: '已確認',
  waitlisted: '候補',
  rejected: '報名未獲接納',
  cancelled: '已取消'
};

export const ATTENDANCE_STATUSES = ['planned', 'attended', 'missed', 'cancelled'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  planned: '計劃出席',
  attended: '已出席',
  missed: '缺席',
  cancelled: '已取消'
};

export const INTERACTION_KINDS = ['message', 'call', 'meeting', 'other'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const RESOURCE_KINDS = ['web_link', 'local_path'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const HABIT_SCHEDULE_TYPES = ['daily', 'weekly'] as const;
export type HabitScheduleType = (typeof HABIT_SCHEDULE_TYPES)[number];

export const HABIT_ENTRY_STATUSES = ['done', 'skipped'] as const;
export type HabitEntryStatus = (typeof HABIT_ENTRY_STATUSES)[number];

export const HEALTH_KINDS = ['exercise', 'sleep', 'note'] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];

