import { config } from '../config.js';
import { get, run } from '../db.js';

function nowMs() {
  return Date.now();
}

export async function checkLogin(username) {
  const row = await get('SELECT * FROM login_attempts WHERE username = ?', [String(username)]);
  if (!row || !row.locked_until) return { locked: false };
  const lockedUntil = Date.parse(row.locked_until);
  if (Number.isNaN(lockedUntil)) return { locked: false };
  const remaining = lockedUntil - nowMs();
  if (remaining > 0) return { locked: true, retryAfter: Math.ceil(remaining / 1000) };
  return { locked: false };
}

export async function recordFailure(username) {
  const key = String(username);
  const row = await get('SELECT * FROM login_attempts WHERE username = ?', [key]);
  const count = (row ? Number(row.failed_count) : 0) + 1;
  const shouldLock = count >= config.loginMaxAttempts;
  const lockedUntil = shouldLock
    ? new Date(nowMs() + config.loginLockMinutes * 60 * 1000).toISOString()
    : null;
  await run(
    `INSERT INTO login_attempts (username, failed_count, first_failed_at, locked_until, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       failed_count = excluded.failed_count,
       locked_until = excluded.locked_until,
       updated_at = excluded.updated_at`,
    [key, count, row?.first_failed_at || new Date().toISOString(), lockedUntil, new Date().toISOString()]
  );
  if (shouldLock) {
    return { locked: true, retryAfter: config.loginLockMinutes * 60 };
  }
  return { locked: false, remaining: config.loginMaxAttempts - count };
}

export async function recordSuccess(username) {
  await run('DELETE FROM login_attempts WHERE username = ?', [String(username)]);
}
