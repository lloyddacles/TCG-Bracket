import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { get, all, run } from '../db.js';

export const DEFAULT_PASSWORD = 'admin123';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

export function newQrToken() {
  return nanoid(14);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: Number(row.active),
    mustChangePassword: Number(row.must_change_password),
    qrToken: row.qr_token,
    cardTheme: row.card_theme || 'kagero',
    cardTitle: row.card_title || null,
    createdAt: row.created_at,
  };
}

export async function createUser({ username, password, name, role = 'player', mustChangePassword = 0, qrToken }) {
  const hash = bcrypt.hashSync(String(password), 10);
  const result = await run(
    `INSERT INTO users (username, password_hash, name, role, must_change_password, qr_token)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [String(username).trim(), hash, String(name).trim(), role, mustChangePassword ? 1 : 0, qrToken || newQrToken()]
  );
  return getUser(result.lastInsertRowid);
}

export async function getUser(id) {
  const row = await get('SELECT * FROM users WHERE id = ?', [id]);
  return row ? publicUser(row) : null;
}

export async function getUserByUsername(username) {
  const row = await get('SELECT * FROM users WHERE lower(username) = lower(?)', [username]);
  return row ? publicUser(row) : null;
}

export async function getUserByQrToken(token) {
  if (!token) return null;
  const row = await get('SELECT * FROM users WHERE qr_token = ?', [String(token).trim()]);
  return row ? publicUser(row) : null;
}

const CARD_THEMES = [
  'kagero',
  'royal-paladin',
  'oracle-think-tank',
  'dimension-police',
  'granblue',
  'narukami',
  'gold-paladin',
  'shadow-paladin',
  'gear-chronicle',
  'aqua-force',
];

export async function updateCard(id, { theme, title }) {
  const fields = [];
  const args = [];
  if (theme !== undefined) {
    if (!CARD_THEMES.includes(theme)) return { ok: false, status: 400, error: 'Unknown card theme' };
    fields.push('card_theme = ?');
    args.push(theme);
  }
  if (title !== undefined) {
    fields.push('card_title = ?');
    args.push(title ? String(title).trim().slice(0, 40) : null);
  }
  if (!fields.length) return { ok: true, user: await getUser(id) };
  args.push(id);
  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, args);
  return { ok: true, user: await getUser(id) };
}

// Give every existing account a QR token exactly once.
export async function ensureUserQrTokens() {
  const rows = await all("SELECT id FROM users WHERE qr_token IS NULL OR qr_token = ''");
  for (const row of rows) {
    await run('UPDATE users SET qr_token = ? WHERE id = ?', [newQrToken(), row.id]);
  }
  return rows.length;
}

export async function verifyCredentials(username, password) {
  const row = await get('SELECT * FROM users WHERE lower(username) = lower(?)', [username]);
  if (!row || Number(row.active) === 0) return null;
  if (!bcrypt.compareSync(String(password), row.password_hash)) return null;
  return publicUser(row);
}

export async function changePassword(id, currentPassword, newPassword) {
  const row = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, status: 404, error: 'User not found' };
  if (!bcrypt.compareSync(String(currentPassword), row.password_hash)) {
    return { ok: false, status: 400, error: 'Current password is incorrect' };
  }
  const hash = bcrypt.hashSync(String(newPassword), 10);
  await run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, id]);
  return { ok: true, user: await getUser(id) };
}

export async function listUsers() {
  const rows = await all('SELECT * FROM users ORDER BY role DESC, name COLLATE NOCASE ASC');
  return rows.map(publicUser);
}

export async function updateUser(id, { name, role, active, password }) {
  const row = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, status: 404, error: 'User not found' };
  const fields = [];
  const args = [];
  if (name !== undefined) {
    fields.push('name = ?');
    args.push(String(name).trim());
  }
  if (role !== undefined && ['admin', 'player'].includes(role)) {
    fields.push('role = ?');
    args.push(role);
  }
  if (active !== undefined) {
    fields.push('active = ?');
    args.push(Number(active) ? 1 : 0);
  }
  if (password) {
    if (String(password).length < 6) {
      return { ok: false, status: 400, error: 'Password must be at least 6 characters' };
    }
    fields.push('password_hash = ?');
    args.push(bcrypt.hashSync(String(password), 10));
  }
  if (!fields.length) return { ok: true, user: await getUser(id) };
  args.push(id);
  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, args);
  return { ok: true, user: await getUser(id) };
}

export async function deleteUser(id) {
  const row = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, status: 404, error: 'User not found' };
  const admins = await get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1");
  if (row.role === 'admin' && Number(admins.c) <= 1) {
    return { ok: false, status: 400, error: 'Cannot delete the last remaining admin' };
  }
  await run('DELETE FROM users WHERE id = ?', [id]);
  return { ok: true };
}

export async function flagUsersWithDefaultPassword() {
  const rows = await all('SELECT id, password_hash FROM users WHERE must_change_password = 0');
  let n = 0;
  for (const row of rows) {
    if (bcrypt.compareSync(DEFAULT_PASSWORD, row.password_hash)) {
      await run('UPDATE users SET must_change_password = 1 WHERE id = ?', [row.id]);
      n += 1;
    }
  }
  return n;
}
