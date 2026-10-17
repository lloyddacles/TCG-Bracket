import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPlayerProfile, updateDeck } from '../services/profile.js';

const router = Router();

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

// Save the signed-in player's deck.
router.put('/deck', requireAuth, async (req, res) => {
  const { deckName, deckList } = req.body || {};
  await updateDeck(req.user.id, { deckName, deckList });
  const profile = await getPlayerProfile(req.user.id, { matchLimit: 0 });
  res.json({ ok: true, user: profile.user });
});

export default router;
