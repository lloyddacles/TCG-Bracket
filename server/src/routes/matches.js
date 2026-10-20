import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { reportMatch, approveMatch, setMatchResult, resetReport, disputeMatch } from '../services/engine.js';
import { getTournamentBundle } from '../services/tournaments.js';
import { get } from '../db.js';

const router = Router();

router.use(requireAuth);

async function respondWithBundle(res, matchId) {
  const match = await get('SELECT tournament_id FROM matches WHERE id = ?', [matchId]);
  res.json(match ? await getTournamentBundle(match.tournament_id) : { ok: true });
}

router.post('/:id/report', async (req, res) => {
  const result = await reportMatch(Number(req.params.id), req.user.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await respondWithBundle(res, Number(req.params.id));
});

router.post('/:id/approve', requireRole('admin'), async (req, res) => {
  const result = await approveMatch(Number(req.params.id), req.user.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await respondWithBundle(res, Number(req.params.id));
});

router.post('/:id/result', requireRole('admin'), async (req, res) => {
  const result = await setMatchResult(Number(req.params.id), req.user.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await respondWithBundle(res, Number(req.params.id));
});

router.post('/:id/dispute', async (req, res) => {
  const result = await disputeMatch(Number(req.params.id), req.user.id, req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await respondWithBundle(res, Number(req.params.id));
});

router.post('/:id/reset', requireRole('admin'), async (req, res) => {
  const result = await resetReport(Number(req.params.id), req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await respondWithBundle(res, Number(req.params.id));
});

export default router;
