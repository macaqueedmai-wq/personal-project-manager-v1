import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const publicOrigin = process.env.PUBLIC_ORIGIN;

if (!publicOrigin || !publicOrigin.startsWith('https://')) {
  throw new Error('PUBLIC_ORIGIN must be an https:// URL');
}

const databasePassword = randomBytes(24).toString('hex');
const sessionSecret = randomBytes(32).toString('hex');
const ownerPassword = randomBytes(18).toString('base64url');
const adminPasswordHash = await bcrypt.hash(ownerPassword, 12);

const envFile = [
  'NODE_ENV=production',
  'PORT=3000',
  'APP_TIMEZONE=Asia/Hong_Kong',
  `PUBLIC_ORIGIN=${publicOrigin}`,
  'POSTGRES_DB=personal_project_manager',
  'POSTGRES_USER=ppm',
  `POSTGRES_PASSWORD=${databasePassword}`,
  `DATABASE_URL=postgres://ppm:${databasePassword}@db:5432/personal_project_manager`,
  `ADMIN_PASSWORD_HASH='${adminPasswordHash}'`,
  `SESSION_SECRET=${sessionSecret}`,
  'TRUST_PROXY_HOPS=1',
  ''
].join('\n');

mkdirSync('.deploy', { recursive: true });
writeFileSync('.deploy/production.env', envFile, { mode: 0o600 });
writeFileSync('.deploy/owner-password.txt', `${ownerPassword}\n`, { mode: 0o600 });

console.log(
  `[deploy] wrote .deploy/production.env and .deploy/owner-password.txt (owner password ${ownerPassword.length} chars)`
);
