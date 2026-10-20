import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPlayerProfile, updateDeck } from '../services/profile.js';
import { getLeaderboard } from '../services/achievements.js';

const router = Router();

// Cross-event leaderboard with earned achievements.
router.get('/leaderboard', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  res.json({ leaderboard: await getLeaderboard({ limit }) });
});

// The signed-in player's own profile.
router.get('/', requireAuth, async (req, res) => {
  const profile = await getPlayerProfile(req.user.id);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json(profile);
});

// Any player's public profile (record, placements, decklist).
router.get('/:id', requireAuth, async (req, res) => {
  const profile = await getPlayerProfile(Number(req.params.id));
  if (!profile) return res.status(404).json({ error: 'Player not found' });
  res.json(profile);
});

// Save the signed-in player's deck profile and artwork.
router.put('/deck', requireAuth, async (req, res) => {
  const result = await updateDeck(req.user.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  const profile = await getPlayerProfile(req.user.id, { matchLimit: 0 });
  res.json({ ok: true, user: profile.user });
});

export default router;
