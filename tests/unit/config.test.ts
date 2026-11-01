import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/config';

const passwordHash = bcrypt.hashSync('unit-test-password', 4);

function validEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/ppm_test',
    PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef',
    TRUST_PROXY_HOPS: '0',
    ...overrides
  };
}

describe('loadConfig', () => {
  it('回傳正規化設定', () => {
    const config = loadConfig(validEnv());
    expect(config.publicOrigin).toBe('http://127.0.0.1:5173');
    expect(config.appTimezone).toBe('Asia/Hong_Kong');
    expect(config.sessionMaxAgeMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('缺少 SESSION_SECRET 時明確失敗', () => {
    expect(() => loadConfig(validEnv({ SESSION_SECRET: undefined }))).toThrow(/SESSION_SECRET/);
  });

  it('缺少 ADMIN_PASSWORD_HASH 時明確失敗', () => {
    expect(() => loadConfig(validEnv({ ADMIN_PASSWORD_HASH: undefined }))).toThrow(
      /ADMIN_PASSWORD_HASH/
    );
  });

  it('拒絕 .env.example 的 Session 密鑰佔位值', () => {
    expect(() =>
      loadConfig(validEnv({ SESSION_SECRET: 'replace-with-at-least-32-random-characters' }))
    ).toThrow(/佔位值/);
  });

  it('拒絕不是 bcrypt 的密碼值', () => {
    expect(() => loadConfig(validEnv({ ADMIN_PASSWORD_HASH: 'plain-text-password' }))).toThrow(
      /bcrypt/
    );
  });

  it('正式環境要求 HTTPS 來源', () => {
    expect(() =>
      loadConfig(
        validEnv({
          NODE_ENV: 'production',
          PUBLIC_ORIGIN: 'http://ppm.example.com'
        })
      )
    ).toThrow(/HTTPS/);
  });

  it('拒絕非 PostgreSQL 連線字串', () => {
    expect(() => loadConfig(validEnv({ DATABASE_URL: 'mysql://localhost/ppm' }))).toThrow(
      /PostgreSQL/
    );
  });
});
