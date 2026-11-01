import { z } from 'zod';
import { AREA_IDS } from './areas.js';
import { isIsoInstant, isValidIsoDate, isValidTimeZone } from './dates.js';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  APPLICATION_TYPES,
  DEGREE_LEVELS,
  isValidOutcomeForStage,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  WORK_TYPES
} from './enums.js';

export const areaIdSchema = z.enum(AREA_IDS);
export const isoDateSchema = z.string().refine(isValidIsoDate, '日期格式不正確');
export const instantSchema = z.string().refine(isIsoInstant, '時間點必須包含時區');
export const timezoneSchema = z
  .string()
  .max(100, '時區名稱過長')
  .refine(isValidTimeZone, '時區格式不正確');
export const urlSchema = z.union([
  z.literal(''),
  z
    .string()
    .url('網址格式不正確')
    .refine((value) => /^https?:\/\//i.test(value), '只接受 http 或 https 網址')
]);
export const tagsSchema = z
  .array(z.string().trim().min(1, '標籤不可空白').max(30, '標籤最多 30 字'))
  .max(10, '最多 10 個標籤')
  .transform((tags) => [...new Set(tags)]);
export const nullableTextSchema = (max = 20_000) =>
  z.string().max(max, `文字最多 ${max} 字`).nullable().optional();
export const taskTitleSchema = z
  .string({ message: '標題必須是文字' })
  .trim()
  .min(1, '標題不可空白')
  .max(200, '標題最多 200 字');

export type TagsInput = z.infer<typeof tagsSchema>;

function refineDuePair(
  value: { dueOn?: string | null; dueAt?: string | null; dueTimezone?: string | null },
  context: z.RefinementCtx
): void {
  const dueOn = value.dueOn ?? null;
  const dueAt = value.dueAt ?? null;
  const dueTimezone = value.dueTimezone ?? null;

  if (dueOn !== null && dueAt !== null) {
    context.addIssue({
      code: 'custom',
      path: ['dueAt'],
      message: '截止日期與截止時間不可同時設定'
    });
  }
  if (dueAt !== null && dueTimezone === null) {
    context.addIssue({ code: 'custom', path: ['dueTimezone'], message: '精確截止需要時區' });
  }
  if (dueAt === null && dueTimezone !== null) {
    context.addIssue({ code: 'custom', path: ['dueTimezone'], message: '沒有精確截止時不可設定時區' });
  }
}

export const createTaskSchema = z
  .strictObject({
    title: taskTitleSchema,
    description: z.string().max(20_000, '備註最多 20000 字').optional(),
    projectId: z.string().uuid('項目識別碼格式不正確').nullable().optional(),
    areaId: areaIdSchema.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    plannedOn: isoDateSchema.nullable().optional(),
    dueOn: isoDateSchema.nullable().optional(),
    dueAt: instantSchema.nullable().optional(),
    dueTimezone: timezoneSchema.nullable().optional(),
    followUpOn: isoDateSchema.nullable().optional(),
    estimatedMinutes: z.number().int().positive('預估分鐘必須是正整數').nullable().optional(),
    tags: tagsSchema.optional(),
    contactId: z.string().uuid('人物識別碼格式不正確').nullable().optional(),
    eventId: z.string().uuid('活動識別碼格式不正確').nullable().optional()
  })
  .superRefine((value, context) => {
    if (value.projectId && value.areaId) {
      context.addIssue({
        code: 'custom',
        path: ['areaId'],
        message: '有項目時不可另外指定領域'
      });
    }
    refineDuePair(value, context);
  });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.strictObject({
  version: z.number().int().min(1, '版本不正確'),
  title: taskTitleSchema.optional(),
  description: z.string().max(20_000, '備註最多 20000 字').optional(),
  projectId: z.string().uuid('項目識別碼格式不正確').nullable().optional(),
  areaId: areaIdSchema.nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  plannedOn: isoDateSchema.nullable().optional(),
  dueOn: isoDateSchema.nullable().optional(),
  dueAt: instantSchema.nullable().optional(),
  dueTimezone: timezoneSchema.nullable().optional(),
  followUpOn: isoDateSchema.nullable().optional(),
  estimatedMinutes: z.number().int().positive('預估分鐘必須是正整數').nullable().optional(),
  tags: tagsSchema.optional(),
  contactId: z.string().uuid('人物識別碼格式不正確').nullable().optional(),
  eventId: z.string().uuid('活動識別碼格式不正確').nullable().optional(),
  archived: z.boolean().optional()
});

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const loginSchema = z.strictObject({
  password: z
    .string({ message: '密碼必須是文字' })
    .min(1, '請輸入密碼')
    .max(200, '密碼長度不正確')
});

export type LoginInput = z.infer<typeof loginSchema>;

const limitSchema = z.preprocess(
  (value) => (value === undefined ? 50 : /^\d+$/.test(String(value)) ? Number(value) : value),
  z
    .number({ message: 'limit 必須是整數' })
    .int('limit 必須是整數')
    .min(1, 'limit 必須介乎 1 至 200')
    .max(200, 'limit 必須介乎 1 至 200')
);

const offsetSchema = z.preprocess(
  (value) => (value === undefined ? 0 : /^\d+$/.test(String(value)) ? Number(value) : value),
  z.number({ message: 'offset 必須是整數' }).int('offset 必須是整數').min(0, 'offset 不可小於 0')
);

const archivedSchema = z.enum(['exclude', 'only', 'all']).default('exclude');

export const listQuerySchema = z.strictObject({
  limit: limitSchema,
  offset: offsetSchema
});

export const taskListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  areaId: areaIdSchema.optional(),
  projectId: z.string().uuid('項目識別碼格式不正確').optional(),
  status: z.enum(TASK_STATUSES).optional(),
  tag: z.string().trim().min(1).max(30).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  undated: z.enum(['true', 'false']).optional(),
  archived: archivedSchema,
  sort: z.enum(['updated', 'created', 'due', 'planned']).default('updated'),
  limit: limitSchema,
  offset: offsetSchema
});

export const projectListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  areaId: areaIdSchema.optional(),
  kind: z.enum(PROJECT_KINDS).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  archived: archivedSchema,
  limit: limitSchema,
  offset: offsetSchema
});

export interface Pagination {
  limit: number;
  offset: number;
}

export const uuidSchema = z.string().uuid('識別碼格式不正確');

export const courseInputSchema = z.strictObject({
  courseCode: z.string().trim().max(100, '課程編號最多 100 字').optional().default(''),
  term: z.string().trim().max(100, '學期最多 100 字').optional().default(''),
  instructorName: z.string().trim().max(200, '導師名稱最多 200 字').optional().default('')
});

export const courseUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  courseCode: z.string().trim().max(100).optional(),
  term: z.string().trim().max(100).optional(),
  instructorName: z.string().trim().max(200).optional()
});

export const applicationInputSchema = z
  .strictObject({
    applicationType: z.enum(APPLICATION_TYPES),
    organizationName: z.string().trim().min(1, '機構名稱不可空白').max(200),
    roleOrProgram: z.string().trim().min(1, '職位或課程不可空白').max(200),
    degreeLevel: z.enum(DEGREE_LEVELS).nullable().optional(),
    workType: z.enum(WORK_TYPES).nullable().optional(),
    location: z.string().trim().max(200).optional().default(''),
    postingUrl: urlSchema.optional().default(''),
    portalUrl: urlSchema.optional().default(''),
    stage: z.enum(APPLICATION_STAGES).optional().default('exploring'),
    outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
    appliedOn: isoDateSchema.nullable().optional(),
    receiptVerified: z.boolean().optional().default(false),
    nextFollowUpOn: isoDateSchema.nullable().optional(),
    notes: z.string().max(20_000).optional().default('')
  })
  .superRefine((value, context) => {
    const outcome = value.outcome ?? null;
    if (!isValidOutcomeForStage(value.stage, outcome)) {
      context.addIssue({ code: 'custom', path: ['outcome'], message: '結果與階段不相符' });
    }
    if (value.applicationType === 'degree' && value.workType) {
      context.addIssue({ code: 'custom', path: ['workType'], message: '學位申請不可設定工作類型' });
    }
    if (value.applicationType === 'job' && value.degreeLevel) {
      context.addIssue({ code: 'custom', path: ['degreeLevel'], message: '職位申請不可設定學位程度' });
    }
  });

export const createProjectSchema = z
  .strictObject({
    primaryAreaId: areaIdSchema,
    title: taskTitleSchema,
    description: z.string().max(20_000, '備註最多 20000 字').optional().default(''),
    kind: z.enum(PROJECT_KINDS).optional().default('general'),
    status: z.enum(PROJECT_STATUSES).optional(),
    dueOn: isoDateSchema.nullable().optional(),
    dueAt: instantSchema.nullable().optional(),
    dueTimezone: timezoneSchema.nullable().optional(),
    nextStep: z.string().trim().max(200, '下一步最多 200 字').optional().default(''),
    tags: tagsSchema.optional(),
    course: courseInputSchema.optional(),
    application: applicationInputSchema.optional()
  })
  .superRefine((value, context) => {
    refineDuePair(value, context);

    if (value.kind === 'general' && (value.course || value.application)) {
      context.addIssue({ code: 'custom', path: ['kind'], message: '一般項目不可包含課程或申請資料' });
    }
    if (value.kind === 'course' && !value.course) {
      context.addIssue({ code: 'custom', path: ['course'], message: '課程項目需要課程資料' });
    }
    if (value.kind === 'course' && value.application) {
      context.addIssue({ code: 'custom', path: ['application'], message: '課程項目不可包含申請資料' });
    }
    if (value.kind !== 'course' && value.course) {
      context.addIssue({ code: 'custom', path: ['course'], message: '只有課程項目可包含課程資料' });
    }
    if (
      (value.kind === 'degree_application' || value.kind === 'job_application') &&
      !value.application
    ) {
      context.addIssue({ code: 'custom', path: ['application'], message: '申請項目需要申請資料' });
    }
    if (value.kind === 'general' || value.kind === 'course') {
      if (value.application) {
        context.addIssue({ code: 'custom', path: ['application'], message: '此項目類型不可包含申請資料' });
      }
    }
  });

export const updateProjectSchema = z
  .strictObject({
    version: z.number().int().min(1),
    title: taskTitleSchema.optional(),
    description: z.string().max(20_000).optional(),
    primaryAreaId: areaIdSchema.optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    dueOn: isoDateSchema.nullable().optional(),
    dueAt: instantSchema.nullable().optional(),
    dueTimezone: timezoneSchema.nullable().optional(),
    nextStep: z.string().trim().max(200).optional(),
    tags: tagsSchema.optional(),
    archived: z.boolean().optional()
  })
  .superRefine((value, context) => {
    if (
      (Object.hasOwn(value, 'dueOn') && value.dueOn !== null) ||
      (Object.hasOwn(value, 'dueAt') && value.dueAt !== null) ||
      Object.hasOwn(value, 'dueTimezone')
    ) {
      refineDuePair(value, context);
    }
  });

export const applicationUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  organizationName: z.string().trim().min(1, '機構名稱不可空白').max(200).optional(),
  roleOrProgram: z.string().trim().min(1, '職位或課程不可空白').max(200).optional(),
  degreeLevel: z.enum(DEGREE_LEVELS).nullable().optional(),
  workType: z.enum(WORK_TYPES).nullable().optional(),
  location: z.string().trim().max(200).optional(),
  postingUrl: urlSchema.optional(),
  portalUrl: urlSchema.optional(),
  stage: z.enum(APPLICATION_STAGES).optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
  appliedOn: isoDateSchema.nullable().optional(),
  receiptVerified: z.boolean().optional(),
  nextFollowUpOn: isoDateSchema.nullable().optional(),
  notes: z.string().max(20_000).optional()
});

const uniqueAreaIdsSchema = z
  .array(areaIdSchema)
  .max(7)
  .refine((ids) => new Set(ids).size === ids.length, '領域不可重複');

const uniqueContactIdsSchema = z
  .array(uuidSchema)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, '人物不可重複');

export const projectRelatedAreasSchema = z.strictObject({
  version: z.number().int().min(1),
  areaIds: uniqueAreaIdsSchema
});

export const projectContactsSchema = z.strictObject({
  version: z.number().int().min(1),
  contactIds: uniqueContactIdsSchema
});

export const focusPutSchema = z.strictObject({
  taskIds: z
    .array(uuidSchema)
    .max(3, '每日最多三項重點')
    .refine((ids) => new Set(ids).size === ids.length, '任務不可重複'),
  version: z.number().int().min(0, '版本不正確')
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ApplicationInput = z.infer<typeof applicationInputSchema>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type FocusPutInput = z.infer<typeof focusPutSchema>;
export type ProjectRelatedAreasInput = z.infer<typeof projectRelatedAreasSchema>;
export type ProjectContactsInput = z.infer<typeof projectContactsSchema>;

const eventBaseShape = {
  title: taskTitleSchema,
  description: z.string().max(20_000).optional().default(''),
  primaryAreaId: areaIdSchema,
  projectId: z.string().uuid('項目識別碼格式不正確').nullable().optional(),
  kind: z
    .enum(['class', 'interview', 'meeting', 'exercise', 'social', 'outreach', 'other'])
    .optional()
    .default('other'),
  location: z.string().trim().max(300).optional().default(''),
  url: urlSchema.optional().default(''),
  allDay: z.boolean().optional().default(false),
  startOn: isoDateSchema.nullable().optional(),
  endOn: isoDateSchema.nullable().optional(),
  startsAt: instantSchema.nullable().optional(),
  endsAt: instantSchema.nullable().optional(),
  timezone: timezoneSchema.nullable().optional(),
  registrationStatus: z
    .enum(['not_needed', 'interested', 'applied', 'confirmed', 'waitlisted', 'rejected', 'cancelled'])
    .optional()
    .default('not_needed'),
  registrationDueOn: isoDateSchema.nullable().optional(),
  registrationDueAt: instantSchema.nullable().optional(),
  registrationDueTimezone: timezoneSchema.nullable().optional(),
  attendanceStatus: z.enum(['planned', 'attended', 'missed', 'cancelled']).optional().default('planned'),
  notes: z.string().max(20_000).optional().default(''),
  tags: tagsSchema.optional()
};

function checkEventShape(
  value: {
    allDay?: boolean;
    startOn?: string | null;
    endOn?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    timezone?: string | null;
    registrationDueOn?: string | null;
    registrationDueAt?: string | null;
    registrationDueTimezone?: string | null;
  },
  context: z.RefinementCtx
): void {
  if (value.allDay) {
    if (!value.startOn || !value.endOn) {
      context.addIssue({ code: 'custom', path: ['startOn'], message: '全天活動需要開始與結束日期' });
    } else if (value.endOn < value.startOn) {
      context.addIssue({ code: 'custom', path: ['endOn'], message: '結束日期不可早於開始日期' });
    }
    if (value.startsAt || value.endsAt || value.timezone) {
      context.addIssue({ code: 'custom', path: ['startsAt'], message: '全天活動不可設定時間點或時區' });
    }
  } else {
    if (!value.startsAt || !value.endsAt || !value.timezone) {
      context.addIssue({ code: 'custom', path: ['startsAt'], message: '定時活動需要開始、結束時間與時區' });
    } else if (value.endsAt <= value.startsAt) {
      context.addIssue({ code: 'custom', path: ['endsAt'], message: '結束時間必須晚於開始時間' });
    }
    if (value.startOn || value.endOn) {
      context.addIssue({ code: 'custom', path: ['startOn'], message: '定時活動不可使用全天日期' });
    }
  }

  if (value.registrationDueOn && value.registrationDueAt) {
    context.addIssue({ code: 'custom', path: ['registrationDueAt'], message: '報名截止日期與時間不可同時設定' });
  }
  if (value.registrationDueAt && !value.registrationDueTimezone) {
    context.addIssue({ code: 'custom', path: ['registrationDueTimezone'], message: '報名截止需要時區' });
  }
  if (!value.registrationDueAt && value.registrationDueTimezone) {
    context.addIssue({ code: 'custom', path: ['registrationDueTimezone'], message: '沒有報名截止時間時不可設定時區' });
  }
}

export const createEventSchema = z.strictObject(eventBaseShape).superRefine((value, context) => {
  checkEventShape(value, context);
});

export const updateEventSchema = z
  .strictObject({
    version: z.number().int().min(1),
    title: taskTitleSchema.optional(),
    description: z.string().max(20_000).optional(),
    primaryAreaId: areaIdSchema.optional(),
    projectId: z.string().uuid().nullable().optional(),
    kind: z.enum(['class', 'interview', 'meeting', 'exercise', 'social', 'outreach', 'other']).optional(),
    location: z.string().trim().max(300).optional(),
    url: urlSchema.optional(),
    allDay: z.boolean().optional(),
    startOn: isoDateSchema.nullable().optional(),
    endOn: isoDateSchema.nullable().optional(),
    startsAt: instantSchema.nullable().optional(),
    endsAt: instantSchema.nullable().optional(),
    timezone: timezoneSchema.nullable().optional(),
    registrationStatus: z
      .enum(['not_needed', 'interested', 'applied', 'confirmed', 'waitlisted', 'rejected', 'cancelled'])
      .optional(),
    registrationDueOn: isoDateSchema.nullable().optional(),
    registrationDueAt: instantSchema.nullable().optional(),
    registrationDueTimezone: timezoneSchema.nullable().optional(),
    attendanceStatus: z.enum(['planned', 'attended', 'missed', 'cancelled']).optional(),
    notes: z.string().max(20_000).optional(),
    tags: tagsSchema.optional(),
    archived: z.boolean().optional()
  });

export const eventRelatedAreasSchema = z.strictObject({
  version: z.number().int().min(1),
  areaIds: uniqueAreaIdsSchema
});

export const eventContactsSchema = z.strictObject({
  version: z.number().int().min(1),
  contactIds: uniqueContactIdsSchema
});

export const contactInputSchema = z.strictObject({
  name: z.string().trim().min(1, '姓名不可空白').max(200),
  organization: z.string().trim().max(200).optional().default(''),
  role: z.string().trim().max(200).optional().default(''),
  email: z.string().trim().max(200).optional().default(''),
  phone: z.string().trim().max(100).optional().default(''),
  profileUrl: urlSchema.optional().default(''),
  relationshipTags: tagsSchema.optional(),
  howMet: z.string().trim().max(2000).optional().default(''),
  notes: z.string().max(20_000).optional().default(''),
  nextContactOn: isoDateSchema.nullable().optional()
});

export const contactUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  name: z.string().trim().min(1, '姓名不可空白').max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  role: z.string().trim().max(200).optional(),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(100).optional(),
  profileUrl: urlSchema.optional(),
  relationshipTags: tagsSchema.optional(),
  howMet: z.string().trim().max(2000).optional(),
  notes: z.string().max(20_000).optional(),
  nextContactOn: isoDateSchema.nullable().optional(),
  archived: z.boolean().optional()
});

export const interactionInputSchema = z.strictObject({
  occurredAt: instantSchema,
  kind: z.enum(['message', 'call', 'meeting', 'other']).optional().default('other'),
  summary: z.string().trim().min(1, '摘要不可空白').max(20_000),
  projectId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional()
});

export const interactionUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  occurredAt: instantSchema.optional(),
  kind: z.enum(['message', 'call', 'meeting', 'other']).optional(),
  summary: z.string().trim().min(1).max(20_000).optional(),
  projectId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional()
});

export const resourceInputSchema = z
  .strictObject({
    title: taskTitleSchema,
    kind: z.enum(['web_link', 'local_path']),
    target: z.string().trim().min(1, '連結或路徑不可空白').max(2000),
    versionLabel: z.string().trim().max(100).optional().default(''),
    notes: z.string().max(20_000).optional().default(''),
    tags: tagsSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.kind === 'web_link' && !/^https?:\/\//i.test(value.target)) {
      context.addIssue({ code: 'custom', path: ['target'], message: '網頁連結只接受 http 或 https' });
    }
  });

export const resourceUpdateSchema = z
  .strictObject({
    version: z.number().int().min(1),
    title: taskTitleSchema.optional(),
    kind: z.enum(['web_link', 'local_path']).optional(),
    target: z.string().trim().min(1).max(2000).optional(),
    versionLabel: z.string().trim().max(100).optional(),
    notes: z.string().max(20_000).optional(),
    tags: tagsSchema.optional(),
    archived: z.boolean().optional()
  })
  .superRefine((value, context) => {
    if (value.kind === 'web_link' && value.target && !/^https?:\/\//i.test(value.target)) {
      context.addIssue({ code: 'custom', path: ['target'], message: '網頁連結只接受 http 或 https' });
    }
  });

export const resourceLinkInputSchema = z
  .strictObject({
    version: z.number().int().min(1),
    projectId: z.string().uuid().nullable().optional(),
    taskId: z.string().uuid().nullable().optional(),
    eventId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional()
  })
  .superRefine((value, context) => {
    const count = [value.projectId, value.taskId, value.eventId, value.contactId].filter(
      (item) => item !== null && item !== undefined
    ).length;
    if (count !== 1) {
      context.addIssue({ code: 'custom', path: ['projectId'], message: '關聯必須恰好指定一個對象' });
    }
  });

export const contactListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  archived: archivedSchema,
  limit: limitSchema,
  offset: offsetSchema
});

export const eventListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  areaId: areaIdSchema.optional(),
  projectId: z.string().uuid().optional(),
  kind: z.enum(['class', 'interview', 'meeting', 'exercise', 'social', 'outreach', 'other']).optional(),
  archived: archivedSchema,
  limit: limitSchema,
  offset: offsetSchema
});

export const resourceListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(['web_link', 'local_path']).optional(),
  archived: archivedSchema,
  limit: limitSchema,
  offset: offsetSchema
});

export const calendarQuerySchema = z.strictObject({
  from: isoDateSchema,
  to: isoDateSchema,
  areaId: areaIdSchema.optional()
});

export const restorePreviewSchema = z.strictObject({
  backup: z.unknown()
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventRelatedAreasInput = z.infer<typeof eventRelatedAreasSchema>;
export type EventContactsInput = z.infer<typeof eventContactsSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type InteractionInput = z.infer<typeof interactionInputSchema>;
export type InteractionUpdateInput = z.infer<typeof interactionUpdateSchema>;
export type ResourceInput = z.infer<typeof resourceInputSchema>;
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;
export type ResourceLinkInput = z.infer<typeof resourceLinkInputSchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>;

const weekdaysSchema = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .refine((days) => new Set(days).size === days.length, '星期不可重複');

export const habitInputSchema = z
  .strictObject({
    title: taskTitleSchema,
    description: z.string().max(20_000).optional().default(''),
    scheduleType: z.enum(['daily', 'weekly']),
    weekdays: weekdaysSchema.optional().default([]),
    startOn: isoDateSchema,
    endOn: isoDateSchema.nullable().optional()
  })
  .superRefine((value, context) => {
    if (value.scheduleType === 'daily' && value.weekdays.length > 0) {
      context.addIssue({ code: 'custom', path: ['weekdays'], message: '每日習慣不設定星期' });
    }
    if (value.scheduleType === 'weekly' && value.weekdays.length === 0) {
      context.addIssue({ code: 'custom', path: ['weekdays'], message: '每週習慣至少選一日' });
    }
    if (value.endOn && value.endOn < value.startOn) {
      context.addIssue({ code: 'custom', path: ['endOn'], message: '結束日期不可早於開始日期' });
    }
  });

export const habitUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  title: taskTitleSchema.optional(),
  description: z.string().max(20_000).optional(),
  scheduleType: z.enum(['daily', 'weekly']).optional(),
  weekdays: weekdaysSchema.optional(),
  endOn: isoDateSchema.nullable().optional(),
  archived: z.boolean().optional()
});

export const habitEntryInputSchema = z.strictObject({
  status: z.enum(['done', 'skipped']),
  note: z.string().max(20_000).optional().default('')
});

export const healthEntryInputSchema = z
  .strictObject({
    localDate: isoDateSchema,
    kind: z.enum(['exercise', 'sleep', 'note']),
    activityName: z.string().trim().max(200).nullable().optional(),
    durationMinutes: z.number().int().positive('運動時長必須是正整數').nullable().optional(),
    sleepHours: z.number().min(0, '睡眠時數不可小於 0').max(24, '睡眠時數不可超過 24').nullable().optional(),
    note: z.string().max(20_000).optional().default('')
  })
  .superRefine((value, context) => {
    if (value.kind === 'exercise' && (value.durationMinutes === null || value.durationMinutes === undefined)) {
      context.addIssue({ code: 'custom', path: ['durationMinutes'], message: '運動紀錄需要時長' });
    }
    if (value.kind === 'sleep' && (value.sleepHours === null || value.sleepHours === undefined)) {
      context.addIssue({ code: 'custom', path: ['sleepHours'], message: '睡眠紀錄需要時數' });
    }
    if (value.kind === 'note' && value.note.trim().length === 0) {
      context.addIssue({ code: 'custom', path: ['note'], message: '備註紀錄需要內容' });
    }
  });

export const healthEntryUpdateSchema = z.strictObject({
  version: z.number().int().min(1),
  localDate: isoDateSchema.optional(),
  kind: z.enum(['exercise', 'sleep', 'note']).optional(),
  activityName: z.string().trim().max(200).nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  note: z.string().max(20_000).optional()
});

export const habitEntryRangeQuerySchema = z.strictObject({
  from: isoDateSchema,
  to: isoDateSchema
});

export const habitListQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  archived: archivedSchema,
  limit: limitSchema,
  offset: offsetSchema
});

export const healthListQuerySchema = z.strictObject({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  kind: z.enum(['exercise', 'sleep', 'note']).optional(),
  limit: limitSchema,
  offset: offsetSchema
});

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1, '請輸入搜尋字串').max(200),
  archived: z.enum(['exclude', 'include']).default('exclude'),
  limit: limitSchema
});

export type HabitInput = z.infer<typeof habitInputSchema>;
export type HabitUpdateInput = z.infer<typeof habitUpdateSchema>;
export type HabitEntryInput = z.infer<typeof habitEntryInputSchema>;
export type HealthEntryInput = z.infer<typeof healthEntryInputSchema>;
export type HealthEntryUpdateInput = z.infer<typeof healthEntryUpdateSchema>;

