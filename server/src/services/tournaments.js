import { nanoid } from 'nanoid';
import { get, all, run } from '../db.js';
import { computeStandings } from './standings.js';
import { getUserByQrToken } from './users.js';

const FORMATS = ['swiss', 'single_elim', 'double_elim', 'round_robin'];
const TIME_RULES = ['sudden_death', 'extra_turns', 'draw', 'none'];

export function publicSlug() {
  return nanoid(10).toLowerCase();
}

export async function getTournament(id) {
  return get('SELECT * FROM tournaments WHERE id = ?', [id]);
}

export async function getTournamentBySlug(slug) {
  return get('SELECT * FROM tournaments WHERE public_slug = ?', [slug]);
}

export async function listTournaments({ status, gameId, userId } = {}) {
  const where = [];
  const args = [];
  if (status) {
    where.push('t.status = ?');
    args.push(status);
  }
  if (gameId) {
    where.push('t.game_id = ?');
    args.push(gameId);
  }
  if (userId) {
    where.push('(t.created_by = ? OR EXISTS (SELECT 1 FROM tournament_players tp WHERE tp.tournament_id = t.id AND tp.user_id = ?))');
    args.push(userId, userId);
  }
  const rows = await all(
    `SELECT t.*, g.name AS game_name, g.slug AS game_slug,
            (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id AND tp.is_bye = 0) AS player_count
     FROM tournaments t
     JOIN games g ON g.id = t.game_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY
       CASE t.status WHEN 'active' THEN 0 WHEN 'registration' THEN 1 WHEN 'draft' THEN 2 WHEN 'completed' THEN 3 ELSE 4 END,
       t.created_at DESC`,
    args
  );
  return rows;
}

export async function createTournament(data, userId) {
  const name = String(data.name || '').trim();
  if (!name) return { ok: false, status: 400, error: 'Tournament name is required' };

  const game = await get('SELECT * FROM games WHERE id = ?', [data.gameId]);
  if (!game) return { ok: false, status: 400, error: 'Select a valid game' };

  const format = FORMATS.includes(data.format) ? data.format : 'swiss';
  const bestOf = clampInt(data.bestOf, 1, 9, Number(game.default_best_of));
  const timeRule = TIME_RULES.includes(data.timeRule) ? data.timeRule : game.default_time_rule;
  const allowDraws =
    data.allowDraws !== undefined ? (data.allowDraws ? 1 : 0) : Number(!game.default_allow_draws) === 0 ? 1 : 0;

  const slug = publicSlug();
  const result = await run(
    `INSERT INTO tournaments
      (name, game_id, format, status, best_of, allow_draws, time_rule, points_win, points_draw, points_loss,
       rounds_override, max_players, registration_open, public_slug, view_public, description, created_by)
     VALUES (?, ?, ?, 'registration', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      data.gameId,
      format,
      bestOf,
      allowDraws,
      timeRule,
      clampInt(data.pointsWin, 0, 100, 3),
      clampInt(data.pointsDraw, 0, 100, 1),
      clampInt(data.pointsLoss, 0, 100, 0),
      data.roundsOverride ? clampInt(data.roundsOverride, 1, 30, null) : null,
      data.maxPlayers ? clampInt(data.maxPlayers, 2, 1024, null) : null,
      data.registrationOpen === undefined || data.registrationOpen ? 1 : 0,
      slug,
      data.viewPublic === undefined || data.viewPublic ? 1 : 0,
      data.description ? String(data.description).trim() : null,
      userId,
    ]
  );
  return { ok: true, tournament: await getTournament(result.lastInsertRowid) };
}

export async function updateTournament(id, data) {
  const t = await getTournament(id);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  const fields = [];
  const args = [];
  const set = (col, val) => {
    fields.push(`${col} = ?`);
    args.push(val);
  };
  if (data.name !== undefined) set('name', String(data.name).trim());
  if (data.description !== undefined) set('description', data.description ? String(data.description).trim() : null);
  if (data.format !== undefined && FORMATS.includes(data.format) && t.status === 'registration') set('format', data.format);
  if (data.bestOf !== undefined) set('best_of', clampInt(data.bestOf, 1, 9, t.best_of));
  if (data.allowDraws !== undefined) set('allow_draws', data.allowDraws ? 1 : 0);
  if (data.timeRule !== undefined && TIME_RULES.includes(data.timeRule)) set('time_rule', data.timeRule);
  if (data.pointsWin !== undefined) set('points_win', clampInt(data.pointsWin, 0, 100, t.points_win));
  if (data.pointsDraw !== undefined) set('points_draw', clampInt(data.pointsDraw, 0, 100, t.points_draw));
  if (data.pointsLoss !== undefined) set('points_loss', clampInt(data.pointsLoss, 0, 100, t.points_loss));
  if (data.roundsOverride !== undefined) set('rounds_override', data.roundsOverride ? clampInt(data.roundsOverride, 1, 30, null) : null);
  if (data.maxPlayers !== undefined) set('max_players', data.maxPlayers ? clampInt(data.maxPlayers, 2, 1024, null) : null);
  if (data.registrationOpen !== undefined) set('registration_open', data.registrationOpen ? 1 : 0);
  if (data.viewPublic !== undefined) set('view_public', data.viewPublic ? 1 : 0);
  if (data.status !== undefined && ['draft', 'registration', 'active', 'completed', 'cancelled'].includes(data.status)) {
    set('status', data.status);
  }
  if (!fields.length) return { ok: true, tournament: t };
  args.push(id);
  await run(`UPDATE tournaments SET ${fields.join(', ')} WHERE id = ?`, args);
  return { ok: true, tournament: await getTournament(id) };
}

export async function deleteTournament(id) {
  const t = await getTournament(id);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  await run('DELETE FROM tournaments WHERE id = ?', [id]);
  return { ok: true };
}

export async function listPlayers(tournamentId) {
  return all(
    `SELECT tp.*, u.name AS user_name, u.username
     FROM tournament_players tp
     JOIN users u ON u.id = tp.user_id
     WHERE tp.tournament_id = ?
     ORDER BY CASE WHEN tp.seed IS NULL THEN 1 ELSE 0 END, tp.seed, tp.id`,
    [tournamentId]
  );
}

function shapePlayer(row) {
  return { ...row, name: row.display_name || row.user_name };
}

export async function registerPlayer(tournamentId, userId) {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  if (t.status !== 'registration') return { ok: false, status: 400, error: 'Registration is closed' };
  if (!Number(t.registration_open)) return { ok: false, status: 400, error: 'Registration is closed' };
  const existing = await get('SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?', [
    tournamentId,
    userId,
  ]);
  if (existing) return { ok: true, player: existing };
  if (t.max_players) {
    const count = await get(
      'SELECT COUNT(*) AS c FROM tournament_players WHERE tournament_id = ? AND is_bye = 0',
      [tournamentId]
    );
    if (Number(count.c) >= Number(t.max_players)) {
      return { ok: false, status: 400, error: 'This tournament is full' };
    }
  }
  const result = await run(
    'INSERT INTO tournament_players (tournament_id, user_id) VALUES (?, ?)',
    [tournamentId, userId]
  );
  return { ok: true, player: await get('SELECT * FROM tournament_players WHERE id = ?', [result.lastInsertRowid]) };
}

export async function unregisterPlayer(tournamentId, userId) {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  const existing = await get('SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?', [
    tournamentId,
    userId,
  ]);
  if (!existing) return { ok: false, status: 404, error: 'You are not registered for this tournament' };
  if (t.status !== 'registration') {
    // Mid-event: mark as dropped instead of removing history.
    await run('UPDATE tournament_players SET dropped = 1 WHERE id = ?', [existing.id]);
    return { ok: true, dropped: true };
  }
  await run('DELETE FROM tournament_players WHERE id = ?', [existing.id]);
  return { ok: true };
}

export async function registerByQr(tournamentId, token, { deck } = {}) {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  const user = await getUserByQrToken(token);
  if (!user) return { ok: false, status: 404, error: 'Unrecognized fighter card' };
  const existing = await get('SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?', [
    tournamentId,
    user.id,
  ]);
  if (existing) {
    if (deck !== undefined) await updatePlayer(existing.id, { deck });
    const player = await get('SELECT * FROM tournament_players WHERE id = ?', [existing.id]);
    return { ok: true, user, player, alreadyIn: true };
  }
  const result = await registerPlayer(tournamentId, user.id);
  if (!result.ok) return { ...result, user };
  if (deck !== undefined) await updatePlayer(result.player.id, { deck });
  const player = await get('SELECT * FROM tournament_players WHERE id = ?', [result.player.id]);
  return { ok: true, user, player, alreadyIn: false };
}

export async function addPlayerByUsername(tournamentId, username) {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  if (t.status === 'completed' || t.status === 'cancelled') {
    return { ok: false, status: 400, error: 'This tournament has ended' };
  }
  const user = await get('SELECT * FROM users WHERE lower(username) = lower(?)', [username]);
  if (!user) return { ok: false, status: 404, error: 'No user with that username' };
  const existing = await get('SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?', [
    tournamentId,
    user.id,
  ]);
  if (existing) return { ok: false, status: 400, error: 'That player is already in the tournament' };
  const result = await run('INSERT INTO tournament_players (tournament_id, user_id) VALUES (?, ?)', [
    tournamentId,
    user.id,
  ]);
  return { ok: true, player: await get('SELECT * FROM tournament_players WHERE id = ?', [result.lastInsertRowid]) };
}

export async function updatePlayer(playerId, data) {
  const player = await get('SELECT * FROM tournament_players WHERE id = ?', [playerId]);
  if (!player) return { ok: false, status: 404, error: 'Player not found' };
  const fields = [];
  const args = [];
  if (data.deck !== undefined) {
    fields.push('deck = ?');
    args.push(data.deck ? String(data.deck).trim() : null);
  }
  if (data.displayName !== undefined) {
    fields.push('display_name = ?');
    args.push(data.displayName ? String(data.displayName).trim() : null);
  }
  if (data.dropped !== undefined) {
    fields.push('dropped = ?');
    args.push(data.dropped ? 1 : 0);
  }
  if (data.seed !== undefined) {
    fields.push('seed = ?');
    args.push(data.seed ? clampInt(data.seed, 1, 100000, null) : null);
  }
  if (!fields.length) return { ok: true, player };
  args.push(playerId);
  await run(`UPDATE tournament_players SET ${fields.join(', ')} WHERE id = ?`, args);
  return { ok: true, player: await get('SELECT * FROM tournament_players WHERE id = ?', [playerId]) };
}

export async function removePlayer(playerId) {
  const player = await get('SELECT * FROM tournament_players WHERE id = ?', [playerId]);
  if (!player) return { ok: false, status: 404, error: 'Player not found' };
  const t = await getTournament(player.tournament_id);
  if (t && t.status !== 'registration') {
    await run('UPDATE tournament_players SET dropped = 1 WHERE id = ?', [playerId]);
    return { ok: true, dropped: true };
  }
  await run('DELETE FROM tournament_players WHERE id = ?', [playerId]);
  return { ok: true };
}

function championOf(t, matches, standings) {
  if (!t || t.status !== 'completed') return null;
  if (t.format === 'swiss' || t.format === 'round_robin') {
    return standings[0] || null;
  }
  if (t.format === 'single_elim') {
    const final = matches
      .filter((m) => m.bracket === 'main')
      .sort((a, b) => b.round - a.round || a.match_index - b.match_index)[0];
    return final && final.winner_id ? { id: final.winner_id } : null;
  }
  if (t.format === 'double_elim') {
    const gf2 = matches.find((m) => m.slot_key === 'GF2' && m.status === 'approved');
    const gf1 = matches.find((m) => m.slot_key === 'GF1');
    const src = gf2 || gf1;
    return src && src.winner_id ? { id: src.winner_id } : null;
  }
  return null;
}

export async function getTournamentBundle(id, { includePrivate = true } = {}) {
  const t = await getTournament(id);
  if (!t) return null;
  const game = await get('SELECT * FROM games WHERE id = ?', [t.game_id]);
  const rawPlayers = await listPlayers(id);
  const players = rawPlayers.map(shapePlayer);
  const matches = await all(
    'SELECT * FROM matches WHERE tournament_id = ? ORDER BY bracket, round, match_index',
    [id]
  );
  const standings = computeStandings({
    players: rawPlayers,
    matches,
    points: { win: t.points_win, draw: t.points_draw, loss: t.points_loss },
  });
  const champion = championOf(t, matches, standings);
  let championPlayer = null;
  if (champion && champion.id) championPlayer = players.find((p) => p.id === champion.id) || champion;
  return {
    tournament: includePrivate ? t : sanitize(t),
    game,
    players,
    matches,
    standings,
    champion: championPlayer,
  };
}

export async function getPublicBundle(slug) {
  const t = await getTournamentBySlug(slug);
  if (!t || !Number(t.view_public)) return null;
  return getTournamentBundle(t.id);
}

function sanitize(t) {
  return { ...t };
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
