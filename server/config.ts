import { z } from 'zod';
import { APP_TIMEZONE } from '../shared/dates.js';

const bcryptHashPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL 不可空白')
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'DATABASE_URL 必須是 PostgreSQL 連線字串'),
  PUBLIC_ORIGIN: z.string().url('PUBLIC_ORIGIN 必須是完整網址'),
  ADMIN_PASSWORD_HASH: z
    .string()
    .regex(bcryptHashPattern, 'ADMIN_PASSWORD_HASH 必須是 bcrypt 雜湊（請執行 npm run auth:hash）'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET 至少需要 32 個字元')
    .refine(
      (value) => !value.toLowerCase().includes('replace-with'),
      'SESSION_SECRET 不可使用 .env.example 的佔位值'
    ),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  APP_TIMEZONE: z.literal(APP_TIMEZONE).optional()
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  publicOrigin: string;
  adminPasswordHash: string;
  sessionSecret: string;
  trustProxyHops: number;
  appTimezone: typeof APP_TIMEZONE;
  sessionCookieName: string;
  sessionMaxAgeMs: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Loads a local .env when present. Missing file is fine; other errors are not. */
export function loadEnvFileIfPresent(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.path.join('.') || '(root)'}：${issue.message}`)
      .join('\n');

    throw new Error(
      `環境設定不完整或格式不正確：\n${details}\n請參考 .env.example，並執行 npm run auth:hash 產生密碼雜湊。`
    );
  }

  const value = parsed.data;
  const publicOrigin = new URL(value.PUBLIC_ORIGIN).origin;

  if (value.NODE_ENV === 'production' && !publicOrigin.startsWith('https://')) {
    throw new Error('正式環境的 PUBLIC_ORIGIN 必須使用 HTTPS。');
  }

  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    publicOrigin,
    adminPasswordHash: value.ADMIN_PASSWORD_HASH,
    sessionSecret: value.SESSION_SECRET,
    trustProxyHops: value.TRUST_PROXY_HOPS,
    appTimezone: APP_TIMEZONE,
    sessionCookieName: 'ppm.sid',
    sessionMaxAgeMs: SEVEN_DAYS_MS
  };
}
