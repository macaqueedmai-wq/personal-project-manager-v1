export const AREA_IDS = [
  'study',
  'degree',
  'career-hk',
  'internship-sz',
  'health',
  'social',
  'outreach'
] as const;

export type AreaId = (typeof AREA_IDS)[number];

export interface AreaDefinition {
  readonly id: AreaId;
  readonly name: string;
  readonly sortOrder: number;
}

/**
 * The seven areas are fixed by the specification. They are seeded by migration
 * 002 and can never be created, renamed or deleted through the application.
 */
export const AREA_DEFINITIONS: readonly AreaDefinition[] = [
  { id: 'study', name: '學業 HKU-MAAIES', sortOrder: 1 },
  { id: 'degree', name: '申博申碩', sortOrder: 2 },
  { id: 'career-hk', name: '香港找工作／實習', sortOrder: 3 },
  { id: 'internship-sz', name: '深圳找實習', sortOrder: 4 },
  { id: 'health', name: '健康管理與運動', sortOrder: 5 },
  { id: 'social', name: '社交圈子管理', sortOrder: 6 },
  { id: 'outreach', name: '其他外展活動', sortOrder: 7 }
] as const;

export const AREA_NAME_BY_ID: Readonly<Record<AreaId, string>> = {
  study: '學業 HKU-MAAIES',
  degree: '申博申碩',
  'career-hk': '香港找工作／實習',
  'internship-sz': '深圳找實習',
  health: '健康管理與運動',
  social: '社交圈子管理',
  outreach: '其他外展活動'
};

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === 'string' && (AREA_IDS as readonly string[]).includes(value);
}
