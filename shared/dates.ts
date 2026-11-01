export const APP_TIMEZONE = 'Asia/Hong_Kong';

const hongKongDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Returns the calendar date (YYYY-MM-DD) in Asia/Hong_Kong. This function never
 * converts a date string through a UTC midnight; callers pass an instant.
 */
export function toHongKongDate(input: Date | string | number = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('無效的時間點');
  }

  const parts = hongKongDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new RangeError('無法轉換香港日期');
  }

  return `${year}-${month}-${day}`;
}

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validates a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
export function isValidIsoDate(value: string): boolean {
  const match = isoDatePattern.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Formats an instant in Hong Kong time for display in Traditional Chinese. */
export function formatHongKongDateTime(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return '未設定';
  }

  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

/** Formats a YYYY-MM-DD calendar date together with its Hong Kong weekday. */
export function formatHongKongDateLabel(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) {
    return '未設定';
  }

  const date = new Date(`${isoDate}T12:00:00+08:00`);

  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(date);
}

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } {
  if (!isValidIsoDate(isoDate)) {
    throw new RangeError(`無效的日期：${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** ISO weekday: Monday=1 ... Sunday=7. */
export function isoWeekday(isoDate: string): number {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function startOfHongKongWeek(isoDate: string): string {
  return addDays(isoDate, -(isoWeekday(isoDate) - 1));
}

export function endOfHongKongWeek(isoDate: string): string {
  return addDays(startOfHongKongWeek(isoDate), 6);
}

export function compareIsoDates(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isDateInRange(date: string, from: string, to: string): boolean {
  return compareIsoDates(date, from) >= 0 && compareIsoDates(date, to) <= 0;
}

export function isValidTimeZone(value: string): boolean {
  if (value.length === 0 || value.length > 100) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function isIsoInstant(value: string): boolean {
  if (!/T/.test(value) || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

export function formatHongKongShortDate(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) {
    return '未設定';
  }

  const date = new Date(`${isoDate}T12:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-HK', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric'
  }).format(date);
}
