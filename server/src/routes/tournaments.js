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
  setSeeds,
  getTournament,
} from '../services/tournaments.js';
import { startTournament, afterResolution, currentStandings } from '../services/engine.js';
import { getUser } from '../services/users.js';
import { bulkTournaments, bulkTournamentPlayers, bulkMatches } from '../services/bulk.js';
import { emitChange, listEvents, logEvent, ACTIONS } from '../services/log.js';
import { subscribe, tournamentBucket, TOURNAMENTS_BUCKET } from '../services/events.js';
import { get } from '../db.js';

const router = Router();

router.use(requireAuth);

// Display label for a tournament_players row.
async function playerName(playerId) {
  const row = await get(
    'SELECT tp.display_name, u.name AS user_name FROM tournament_players tp LEFT JOIN users u ON u.id = tp.user_id WHERE tp.id = ?',
    [playerId]
  );
  if (!row) return `Player ${playerId}`;
  return row.display_name || row.user_name || `Player ${playerId}`;
}

router.get('/', async (req, res) => {
  const { status, gameId, mine } = req.query;
  const tournaments = await listTournaments({
    status: status || undefined,
    gameId: gameId ? Number(gameId) : undefined,
    userId: mine === 'true' ? req.user.id : undefined,
  });
  res.json({ tournaments });
});

// Global live feed so the tournament list can refresh itself. Declared before
// `GET /:id` so "events" is not read as a tournament id.
router.get('/events', async (req, res) => {
  req.socket.setTimeout?.(0);
  subscribe(TOURNAMENTS_BUCKET, req, res);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const result = await createTournament(req.body || {}, req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  emitChange(result.tournament.id, 'created');
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

// Live updates — server-sent events for this tournament.
router.get('/:id/events', async (req, res) => {
  const id = Number(req.params.id);
  const t = await getTournament(id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  req.socket.setTimeout?.(0);
  subscribe(tournamentBucket(id), req, res);
});

// Audit trail. Actor identity is only exposed to organizers.
router.get('/:id/history', async (req, res) => {
  const id = Number(req.params.id);
  const t = await getTournament(id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const events = await listEvents(id, { limit, includeActor: req.user.role === 'admin' });
  res.json({ events });
});

// Bracket seeding — only meaningful before the tournament starts.
router.post('/:id/seeds', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { playerIds = null, mode = null } = req.body || {};
  const result = await setSeeds(id, { playerIds, mode, actorId: req.user.id });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(id));
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const result = await updateTournament(Number(req.params.id), req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  emitChange(Number(req.params.id), 'updated');
  res.json({ tournament: result.tournament });
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const result = await deleteTournament(Number(req.params.id));
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  emitChange(Number(req.params.id), 'deleted');
  res.json({ ok: true });
});

router.post('/:id/start', requireRole('admin'), async (req, res) => {
  const result = await startTournament(Number(req.params.id), req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.post('/:id/advance', requireRole('admin'), async (req, res) => {
  const t = await getTournament(Number(req.params.id));
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  await afterResolution(t.id, req.user.id);
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
  const id = Number(req.params.id);
  const result = await registerPlayer(id, req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await logEvent({
    tournamentId: id,
    action: ACTIONS.REGISTERED,
    actorId: req.user.id,
    summary: `${req.user.name} registered`,
    details: { playerId: result.player?.id ?? null },
  });
  res.json(await getTournamentBundle(id));
});

router.post('/:id/unregister', async (req, res) => {
  const id = Number(req.params.id);
  const result = await unregisterPlayer(id, req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await logEvent({
    tournamentId: id,
    action: result.dropped ? ACTIONS.PLAYER_REMOVED : ACTIONS.UNREGISTERED,
    actorId: req.user.id,
    summary: result.dropped
      ? `${req.user.name} withdrew (marked dropped)`
      : `${req.user.name} cancelled registration`,
  });
  res.json(await getTournamentBundle(id));
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
  await logEvent({
    tournamentId: Number(req.params.id),
    action: ACTIONS.CHECKED_IN,
    actorId: req.user.id,
    summary: result.alreadyIn
      ? `${result.user.name} scanned the desk — already checked in`
      : `${result.user.name} checked in${result.user.id !== req.user.id ? ` by ${req.user.name}` : ''}`,
    details: { userId: result.user.id, alreadyIn: !!result.alreadyIn, deck: deck || null },
  });
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
  const id = Number(req.params.id);
  const result = await addPlayerByUsername(id, username);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await logEvent({
    tournamentId: id,
    action: ACTIONS.PLAYER_ADDED,
    actorId: req.user.id,
    summary: `${username} added to the roster by ${req.user.name}`,
    details: { playerId: result.player?.id ?? null, username },
  });
  res.json(await getTournamentBundle(id));
});

router.post('/:id/players/bulk', requireRole('admin'), async (req, res) => {
  const result = await bulkTournamentPlayers(Number(req.params.id), req.body || {}, req.user.id);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.put('/:id/players/:playerId', requireRole('admin'), async (req, res) => {
  const result = await updatePlayer(Number(req.params.playerId), req.body || {});
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  emitChange(Number(req.params.id), 'player_updated');
  res.json(await getTournamentBundle(Number(req.params.id)));
});

router.delete('/:id/players/:playerId', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const playerId = Number(req.params.playerId);
  const name = await playerName(playerId);
  const result = await removePlayer(playerId);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  await logEvent({
    tournamentId: id,
    action: ACTIONS.PLAYER_REMOVED,
    actorId: req.user.id,
    summary: result.dropped
      ? `${name} marked dropped by ${req.user.name}`
      : `${name} removed from the roster by ${req.user.name}`,
    details: { playerId, dropped: !!result.dropped },
  });
  res.json(await getTournamentBundle(id));
});

export default router;
