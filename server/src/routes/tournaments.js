import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listTournaments,
  createTournament,
  updateTournament,
  deleteTournament,
  getTournamentBundle,
  registerPlayer,
  unregisterPlayer,
  registerByQr,
  addPlayerByUsername,
  updatePlayer,
  removePlayer,
  getTournament,
} from '../services/tournaments.js';
import { startTournament, afterResolution, currentStandings } from '../services/engine.js';
import { getUser } from '../services/users.js';
import { bulkTournaments, bulkTournamentPlayers, bulkMatches } from '../services/bulk.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const { status, gameId, mine } = req.query;
  const tournaments = await listTournaments({
    status: status || undefined,
    gameId: gameId ? Number(gameId) : undefined,
    userId: mine === 'true' ? req.user.id : undefined,
  });
  res.json({ tournaments });
});

router.post('/', requireRole('admin'), async (req, res) => {
  const result = await createTournament(req.body || {}, req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ tournament: result.tournament });
});

router.post('/bulk', requireRole('admin'), async (req, res) => {
  const result = await bulkTournaments(req.body || {}, req.user.id);
  res.json({ ...result, tournaments: await listTournaments({}) });
});

router.get('/:id', async (req, res) => {
  const bundle = await getTournamentBundle(Number(req.params.id));
  if (!bundle) return res.status(404).json({ error: 'Tournament not found' });
  res.json(bundle);
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const result = await updateTournament(Number(req.params.id), req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ tournament: result.tournament });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const result = await deleteTournament(Number(req.params.id));
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

router.post('/:id/start', requireRole('admin'), async (req, res) => {
  const result = await startTournament(Number(req.params.id));
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.post('/:id/advance', requireRole('admin'), async (req, res) => {
  const t = await getTournament(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  await afterResolution(t.id);
  res.json(await getTournamentBundle(t.id));
});

router.post('/:id/matches/bulk', requireRole('admin'), async (req, res) => {
  const result = await bulkMatches(Number(req.params.id), req.body || {}, req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.get('/:id/standings', async (req, res) => {
  res.json({ standings: await currentStandings(Number(req.params.id)) });
});

router.post('/:id/register', async (req, res) => {
  const result = await registerPlayer(Number(req.params.id), req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.post('/:id/unregister', async (req, res) => {
  const result = await unregisterPlayer(Number(req.params.id), req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.post('/:id/scan', async (req, res) => {
  const { token, payload, deck } = req.body || {};
  let raw = token || payload;
  if (!raw) return res.status(400).json({ error: 'A fighter card QR payload is required' });
  if (typeof raw === 'string' && raw.startsWith('TCGBRACKET:')) raw = raw.slice('TCGBRACKET:'.length);

  // Players may only check themselves in; organizers may check in anyone.
  if (req.user.role !== 'admin') {
    const me = await getUser(req.user.id);
    if (!me || me.qrToken !== raw) {
      return res.status(403).json({ error: 'Only organizers can check in other players' });
    }
  }

  const result = await registerByQr(Number(req.params.id), raw, { deck });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({
    ok: true,
    alreadyIn: result.alreadyIn,
    player: result.player,
    user: { id: result.user.id, name: result.user.name, username: result.user.username, cardTheme: result.user.cardTheme },
    tournament: await getTournamentBundle(Number(req.params.id)),
  });
});

router.post('/:id/players', requireRole('admin'), async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'Username is required' });
  const result = await addPlayerByUsername(Number(req.params.id), username);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.post('/:id/players/bulk', requireRole('admin'), async (req, res) => {
  const result = await bulkTournamentPlayers(Number(req.params.id), req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.put('/:id/players/:playerId', requireRole('admin'), async (req, res) => {
  const result = await updatePlayer(Number(req.params.playerId), req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.delete('/:id/players/:playerId', requireRole('admin'), async (req, res) => {
  const result = await removePlayer(Number(req.params.playerId));
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

export default router;
