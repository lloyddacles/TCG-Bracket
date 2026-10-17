import { Router } from 'express';
import {
  verifyCredentials,
  changePassword,
  getUser,
  getUserByUsername,
  createUser,
  updateCard,
  DEFAULT_PASSWORD,
} from '../services/users.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { checkLogin, recordFailure, recordSuccess } from '../services/loginGuard.js';
import { config } from '../config.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, password, name } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Name, username and password are required' });
  }
  if (String(username).trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (await getUserByUsername(username)) {
    return res.status(409).json({ error: 'That username is already taken' });
  }
  const user = await createUser({
    username: String(username).trim(),
    password,
    name: String(name).trim(),
    role: 'player',
  });
  res.status(201).json({ token: signToken(user), user });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const gate = await checkLogin(username);
  if (gate.locked) {
    res.setHeader('Retry-After', String(gate.retryAfter));
    return res.status(429).json({
      error: `Too many failed sign-in attempts. Try again in ${Math.ceil(gate.retryAfter / 60)} minute(s).`,
      retryAfter: gate.retryAfter,
    });
  }
  const user = await verifyCredentials(username, password);
  if (!user) {
    const status = await recordFailure(username);
    if (status.locked) {
      res.setHeader('Retry-After', String(status.retryAfter));
      return res.status(429).json({
        error: `Too many failed sign-in attempts. This account is locked for ${config.loginLockMinutes} minute(s).`,
        retryAfter: status.retryAfter,
      });
    }
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  await recordSuccess(username);
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await getUser(req.user.id) });
});

router.put('/card', requireAuth, async (req, res) => {
  const { theme, title } = req.body || {};
  const result = await updateCard(req.user.id, { theme, title });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ user: result.user });
});

router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  if (String(newPassword).toLowerCase() === DEFAULT_PASSWORD) {
    return res.status(400).json({ error: 'Please choose a password other than the default' });
  }
  const result = await changePassword(req.user.id, currentPassword, newPassword);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, user: result.user });
});

export default router;
