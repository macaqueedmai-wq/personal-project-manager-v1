import { describe, expect, it } from 'vitest';
import { createTaskSchema, listQuerySchema, loginSchema } from '@shared/schemas';
import { zodFieldErrors } from '../../server/errors';

describe('createTaskSchema', () => {
  it('去除標題首尾空白', () => {
    const parsed = createTaskSchema.parse({ title: '  閱讀方法論文章  ' });
    expect(parsed.title).toBe('閱讀方法論文章');
  });

  it('拒絕空白標題並指出欄位', () => {
    const result = createTaskSchema.safeParse({ title: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['title']);
    }
  });

  it('接受 200 字並拒絕 201 字', () => {
    expect(createTaskSchema.safeParse({ title: '字'.repeat(200) }).success).toBe(true);
    expect(createTaskSchema.safeParse({ title: '字'.repeat(201) }).success).toBe(false);
  });

  it('拒絕未定義欄位，避免靜默寫入', () => {
    const result = createTaskSchema.safeParse({ title: '任務', status: 'done' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
      expect(zodFieldErrors(result.error).status).toBeDefined();
    }
  });
});

describe('loginSchema', () => {
  it('要求非空密碼', () => {
    expect(loginSchema.safeParse({ password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ password: 'secret' }).success).toBe(true);
  });
});

describe('listQuerySchema', () => {
  it('提供預設分頁', () => {
    expect(listQuerySchema.parse({})).toEqual({ limit: 50, offset: 0 });
  });

  it('接受字串數字', () => {
    expect(listQuerySchema.parse({ limit: '200', offset: '3' })).toEqual({
      limit: 200,
      offset: 3
    });
  });

  it('限制最大 200 筆', () => {
    expect(listQuerySchema.safeParse({ limit: '201' }).success).toBe(false);
  });

  it('拒絕負數與未知參數', () => {
    expect(listQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ status: 'todo' }).success).toBe(false);
  });
});
