import { describe, expect, it } from 'vitest';
import {
  fingerprintPasswordHash,
  LoginRateLimiter,
  safeTokenEquals
} from '../../server/services/auth';

describe('LoginRateLimiter', () => {
  it('超過失敗上限後暫時封鎖，期滿後恢復', () => {
    const limiter = new LoginRateLimiter({ windowMs: 1_000, maxFailures: 3 });
    const key = '127.0.0.1';
    const start = 1_000_000;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(limiter.check(key, start).blocked).toBe(false);
      limiter.recordFailure(key, start);
    }

    const blocked = limiter.check(key, start + 1);
    expect(blocked.blocked).toBe(true);
    expect(blocked.retryAfterSeconds).toBe(1);

    expect(limiter.check(key, start + 1_001).blocked).toBe(false);
  });

  it('成功登入會清除失敗記錄', () => {
    const limiter = new LoginRateLimiter({ windowMs: 1_000, maxFailures: 2 });
    limiter.recordFailure('ip');
    limiter.reset('ip');
    limiter.recordFailure('ip');
    expect(limiter.check('ip').blocked).toBe(false);
  });
});

describe('token helpers', () => {
  it('只接受完全相同的 token', () => {
    expect(safeTokenEquals('abc123', 'abc123')).toBe(true);
    expect(safeTokenEquals('abc123', 'abc124')).toBe(false);
    expect(safeTokenEquals('abc123', 'abc1234')).toBe(false);
  });

  it('密碼雜湊指紋穩定且不暴露雜湊', () => {
    const hash = '$2b$04$abcdefghijklmnopqrstuv';
    const fingerprint = fingerprintPasswordHash(hash);
    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).toBe(fingerprintPasswordHash(hash));
    expect(fingerprint).not.toContain('abcdefghij');
  });
});
