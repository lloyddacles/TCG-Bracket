import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listUsers, createUser, updateUser, deleteUser, getUser, getUserByUsername } from '../services/users.js';
import { bulkUsers } from '../services/bulk.js';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', async (req, res) => {
  res.json({ users: await listUsers() });
});

router.post('/bulk', async (req, res) => {
  const result = await bulkUsers(req.body || {}, req.user.id);
  res.json({ ...result, users: await listUsers() });
});

router.post('/', async (req, res) => {
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Name, username and password are required' });
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
    role: role === 'admin' ? 'admin' : 'player',
  });
  res.status(201).json({ user });
});

router.put('/:id', async (req, res) => {
  const result = await updateUser(Number(req.params.id), req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ user: result.user });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  const result = await deleteUser(id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

export default router;
