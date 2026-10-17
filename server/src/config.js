import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const defaultDbUrl = `file:${path.join(__dirname, '..', 'data', 'tcg-bracket.sqlite')}`;

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (isProduction) {
    throw new Error(
      'JWT_SECRET is not set. Set a long random value (e.g. `openssl rand -hex 32`) in the environment before deploying.'
    );
  }
  jwtSecret = 'dev-insecure-secret';
}

export const config = {
  port: Number(process.env.PORT || 4100),
  jwtSecret,
  isProduction,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5273',
  forceDefaultPasswordChange:
    process.env.FORCE_DEFAULT_PASSWORD_CHANGE !== undefined
      ? !['0', 'false', 'no'].includes(process.env.FORCE_DEFAULT_PASSWORD_CHANGE.toLowerCase())
      : isProduction,
  loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES || 15),
  dbUrl: process.env.TURSO_DATABASE_URL || process.env.DB_URL || defaultDbUrl,
  dbAuthToken: process.env.TURSO_AUTH_TOKEN || process.env.DB_AUTH_TOKEN || undefined,
};
