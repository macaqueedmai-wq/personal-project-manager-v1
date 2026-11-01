import type { AreaId } from './areas.js';
import type {
  ApplicationOutcome,
  ApplicationStage,
  ApplicationType,
  AttendanceStatus,
  DegreeLevel,
  EventKind,
  HabitEntryStatus,
  HabitScheduleType,
  HealthKind,
  InteractionKind,
  ProjectKind,
  ProjectStatus,
  RegistrationStatus,
  ResourceKind,
  TaskPriority,
  TaskStatus,
  WorkType
} from './enums.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
}

export interface ResponseMeta {
  workspaceEpoch: string;
  revision: string;
  today: string;
  now: string;
  total?: number;
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: ResponseMeta;
}

export interface AreaDto {
  id: AreaId;
  name: string;
  sortOrder: number;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string;
  projectId: string | null;
  areaId: AreaId | null;
  effectiveAreaId: AreaId | null;
  projectTitle: string | null;
  projectArchivedAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  plannedOn: string | null;
  dueOn: string | null;
  dueAt: string | null;
  dueTimezone: string | null;
  followUpOn: string | null;
  estimatedMinutes: number | null;
  completedAt: string | null;
  contactId: string | null;
  eventId: string | null;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CourseDto {
  courseCode: string;
  term: string;
  instructorName: string;
}

export interface ApplicationDto {
  applicationType: ApplicationType;
  organizationName: string;
  roleOrProgram: string;
  degreeLevel: DegreeLevel | null;
  workType: WorkType | null;
  location: string;
  postingUrl: string;
  portalUrl: string;
  stage: ApplicationStage;
  outcome: ApplicationOutcome | null;
  appliedOn: string | null;
  receiptVerified: boolean;
  nextFollowUpOn: string | null;
  notes: string;
}

export interface ApplicationStageHistoryDto {
  id: string;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  changedAt: string;
  note: string;
}

export interface ProjectDto {
  id: string;
  primaryAreaId: AreaId;
  title: string;
  description: string;
  kind: ProjectKind;
  status: ProjectStatus;
  dueOn: string | null;
  dueAt: string | null;
  dueTimezone: string | null;
  nextStep: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  course: CourseDto | null;
  application: ApplicationDto | null;
  relatedAreaIds?: AreaId[];
  contactIds?: string[];
}

export interface EventDto {
  id: string;
  title: string;
  description: string;
  primaryAreaId: AreaId;
  projectId: string | null;
  kind: EventKind;
  location: string;
  url: string;
  allDay: boolean;
  startOn: string | null;
  endOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  registrationStatus: RegistrationStatus;
  registrationDueOn: string | null;
  registrationDueAt: string | null;
  registrationDueTimezone: string | null;
  attendanceStatus: AttendanceStatus;
  notes: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  relatedAreaIds?: AreaId[];
  contactIds?: string[];
}

export interface ContactDto {
  id: string;
  name: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  profileUrl: string;
  relationshipTags: string[];
  howMet: string;
  notes: string;
  nextContactOn: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  lastInteractionAt?: string | null;
}

export interface InteractionDto {
  id: string;
  contactId: string;
  occurredAt: string;
  kind: InteractionKind;
  summary: string;
  projectId: string | null;
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceDto {
  id: string;
  title: string;
  kind: ResourceKind;
  target: string;
  versionLabel: string;
  notes: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ResourceLinkDto {
  id: string;
  resourceId: string;
  projectId: string | null;
  taskId: string | null;
  eventId: string | null;
  contactId: string | null;
}

export interface HabitDto {
  id: string;
  title: string;
  description: string;
  scheduleType: HabitScheduleType;
  weekdays: number[];
  startOn: string;
  endOn: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface HabitEntryDto {
  habitId: string;
  localDate: string;
  status: HabitEntryStatus;
  note: string;
}

export interface HealthEntryDto {
  id: string;
  localDate: string;
  kind: HealthKind;
  activityName: string | null;
  durationMinutes: number | null;
  sleepHours: number | null;
  note: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FocusDayDto {
  date: string;
  version: number;
  tasks: TaskDto[];
}

export type DashboardTaskReason = 'planned' | 'due';

export interface DashboardTaskItem {
  task: TaskDto;
  reasons: DashboardTaskReason[];
}

export interface DashboardUpcomingItem {
  type: 'task' | 'project' | 'event';
  id: string;
  title: string;
  date: string | null;
  dateTime: string | null;
  meta: string;
}

export interface DashboardWaitingItem {
  type: 'task' | 'application' | 'contact';
  id: string;
  title: string;
  followUpOn: string | null;
  overdue: boolean;
  meta: string;
}

export interface DashboardDto {
  today: string;
  weekStart: string;
  weekEnd: string;
  now: string;
  focus: TaskDto[];
  focusVersion: number;
  todayTasks: DashboardTaskItem[];
  weekTasks: DashboardTaskItem[];
  upcoming: DashboardUpcomingItem[];
  waiting: DashboardWaitingItem[];
  events: EventDto[];
  habits: HabitDto[];
}

export interface CalendarOccurrence {
  key: string;
  sourceType: 'event' | 'task' | 'project' | 'application' | 'contact';
  sourceId: string;
  occurrenceType:
    | 'event'
    | 'planned'
    | 'due'
    | 'followUp'
    | 'projectDue'
    | 'applicationDeadline'
    | 'registrationDue'
    | 'contactFollowUp';
  occurrenceTypes: Array<CalendarOccurrence['occurrenceType']>;
  title: string;
  areaId: AreaId | null;
  projectId: string | null;
  startOn: string;
  endOn: string;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  completed: boolean;
}

export interface SearchResultDto {
  type: 'task' | 'project' | 'application' | 'event' | 'contact' | 'resource';
  id: string;
  title: string;
  subtitle: string;
  areaId: AreaId | null;
  archived: boolean;
}

export interface AppSettingsDto {
  locale: 'zh-HK';
  timezone: 'Asia/Hong_Kong';
  weekStartsOn: 1;
}

export interface BackupCountsDto {
  areas: number;
  projects: number;
  tasks: number;
  events: number;
  contacts: number;
  resources: number;
  habits: number;
  healthEntries: number;
  courseDetails?: number;
  applications?: number;
  applicationStageHistory?: number;
  focusDays?: number;
  interactions?: number;
  projectRelatedAreas?: number;
  projectContacts?: number;
  eventRelatedAreas?: number;
  eventContacts?: number;
  resourceLinks?: number;
  habitEntries?: number;
}

export interface BackupPreviewDto {
  token: string;
  fileHash: string;
  revision: string;
  workspaceEpoch: string;
  expiresAt: string;
  current: BackupCountsDto;
  incoming: BackupCountsDto;
}

export interface SessionDto {
  authenticated: boolean;
  csrfToken: string | null;
  workspaceEpoch: string | null;
  today: string | null;
  now: string | null;
  timezone: string;
  reason?: 'expired';
}
