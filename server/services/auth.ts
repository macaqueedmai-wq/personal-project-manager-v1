import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

export function fingerprintPasswordHash(hash: string): string {
  return createHash('sha256').update(hash, 'utf8').digest('hex');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function safeTokenEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

interface Attempt {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number | null;
}

export interface RateLimitDecision {
  blocked: boolean;
  retryAfterSeconds: number;
}

export interface LoginRateLimiterOptions {
  windowMs?: number;
  maxFailures?: number;
}

/**
 * In-memory login throttle. Adequate for the single-owner, single-process
 * deployment in this version; documented in docs/DECISIONS.md.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();
  private readonly windowMs: number;
  private readonly maxFailures: number;

  constructor(options: LoginRateLimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 15 * 60 * 1000;
    this.maxFailures = options.maxFailures ?? 10;
  }

  check(key: string, now = Date.now()): RateLimitDecision {
    const attempt = this.attempts.get(key);

    if (!attempt) {
      return { blocked: false, retryAfterSeconds: 0 };
    }

    if (attempt.blockedUntil !== null) {
      if (attempt.blockedUntil > now) {
        return {
          blocked: true,
          retryAfterSeconds: Math.max(1, Math.ceil((attempt.blockedUntil - now) / 1000))
        };
      }

      this.attempts.delete(key);
      return { blocked: false, retryAfterSeconds: 0 };
    }

    if (now - attempt.windowStartedAt >= this.windowMs) {
      this.attempts.delete(key);
    }

    return { blocked: false, retryAfterSeconds: 0 };
  }

  recordFailure(key: string, now = Date.now()): void {
    this.prune(now);
    const current = this.attempts.get(key);

    if (!current || now - current.windowStartedAt >= this.windowMs) {
      this.attempts.set(key, { failures: 1, windowStartedAt: now, blockedUntil: null });
      return;
    }

    const failures = current.failures + 1;
    current.failures = failures;

    if (failures >= this.maxFailures) {
      current.blockedUntil = now + this.windowMs;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  private prune(now: number): void {
    if (this.attempts.size < 1_000) {
      return;
    }

    for (const [key, attempt] of this.attempts) {
      const expiredBlock = attempt.blockedUntil !== null && attempt.blockedUntil <= now;
      const expiredWindow = now - attempt.windowStartedAt >= this.windowMs;
      if (expiredBlock || expiredWindow) {
        this.attempts.delete(key);
      }
    }
  }
}
