import { describe, expect, it } from 'vitest';
import {
  formatHongKongDateLabel,
  formatHongKongDateTime,
  isValidIsoDate,
  toHongKongDate
} from '@shared/dates';

describe('香港日期換算', () => {
  it('在香港午夜前仍屬同一日', () => {
    expect(toHongKongDate('2026-11-01T15:59:59Z')).toBe('2026-11-01');
  });

  it('在香港午夜後進入下一日', () => {
    expect(toHongKongDate('2026-11-01T16:00:00Z')).toBe('2026-11-02');
  });

  it('跨年的香港日期正確', () => {
    expect(toHongKongDate('2026-12-31T16:00:00Z')).toBe('2027-01-01');
  });

  it('不接受不存在的日曆日期', () => {
    expect(isValidIsoDate('2026-11-01')).toBe(true);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('01/11/2026')).toBe(false);
  });

  it('顯示香港時間而非 UTC 時間', () => {
    expect(formatHongKongDateTime('2026-11-01T09:00:00Z')).toContain('17:00');
  });

  it('星期標籤以香港日期為準', () => {
    const label = formatHongKongDateLabel('2026-11-01');
    expect(label).toContain('2026');
    expect(label).toContain('11');
    expect(label).toContain('1');
    expect(label).toContain('星期日');
  });
});
