import { nanoid } from 'nanoid';
import { get, all } from '../db.js';
import {
  createUser,
  updateUser,
  deleteUser,
  getUserByUsername,
} from './users.js';
import {
  createTournament,
  getTournament,
  updateTournament,
  deleteTournament,
  registerPlayer,
  addPlayerByUsername,
  updatePlayer,
  removePlayer,
  getTournamentBundle,
} from './tournaments.js';
import { setMatchResult, approveMatch, resetReport } from './engine.js';
import { emitChange, logEvent, ACTIONS } from './log.js';

function addError(summary, ref, message) {
  summary.errors.push({ ref: String(ref), message });
}

/* --------------------------------- Users --------------------------------- */

export async function bulkUsers({ create = [], update = [], remove = [], deactivate = [], activate = [] }, requesterId = null) {
  const summary = { created: 0, updated: 0, removed: 0, skipped: 0, errors: [] };
  const issued = [];

  for (const [i, row] of (create || []).entries()) {
    const username = String(row?.username || '').trim();
    const name = String(row?.name || '').trim();
    if (!username || !name) {
      summary.skipped += 1;
      addError(summary, username || `row ${i + 1}`, 'username and name are required');
      continue;
    }
    if (await getUserByUsername(username)) {
      summary.skipped += 1;
      addError(summary, username, 'username already exists');
      continue;
    }
    const supplied = row.password && String(row.password).length >= 6 ? String(row.password) : null;
    const password = supplied || nanoid(10);
    const role = row.role === 'admin' ? 'admin' : 'player';
    const user = await createUser({ username, name, password, role, mustChangePassword: supplied ? 0 : 1 });
    issued.push({ id: user.id, username: user.username, name: user.name, password, generated: !supplied });
    summary.created += 1;
  }

  for (const row of update || []) {
    if (row?.id == null) {
      summary.skipped += 1;
      continue;
    }
    const res = await updateUser(Number(row.id), {
      name: row.name,
      role: row.role,
      active: row.active,
      password: row.password,
    });
    if (res.ok) summary.updated += 1;
    else {
      summary.skipped += 1;
      addError(summary, `user ${row.id}`, res.error);
    }
  }

  const setActive = async (ids, active) => {
    for (const id of ids || []) {
      if (active === 0 && Number(id) === Number(requesterId)) {
        summary.skipped += 1;
        addError(summary, `user ${id}`, 'You cannot disable your own account');
        continue;
      }
      const res = await updateUser(Number(id), { active });
      if (res.ok) summary.updated += 1;
      else {
        summary.skipped += 1;
        addError(summary, `user ${id}`, res.error);
      }
    }
  };
  await setActive(deactivate, 0);
  await setActive(activate, 1);

  for (const id of remove || []) {
    if (Number(id) === Number(requesterId)) {
      summary.skipped += 1;
      addError(summary, `user ${id}`, 'You cannot delete your own account');
      continue;
    }
    const res = await deleteUser(Number(id));
    if (res.ok) summary.removed += 1;
    else {
      summary.skipped += 1;
      addError(summary, `user ${id}`, res.error);
    }
  }

  return { ok: true, summary, issued };
}

/* -------------------------- Tournament players --------------------------- */

export async function bulkTournamentPlayers(
  tournamentId,
  { add = [], update = [], remove = [] },
  actorId = null
) {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  const summary = { added: 0, updated: 0, removed: 0, skipped: 0, errors: [] };

  for (const entry of add || []) {
    const username = String((typeof entry === 'string' ? entry : entry?.username) || '').trim();
    if (!username) {
      summary.skipped += 1;
      continue;
    }
    const user = await getUserByUsername(username);
    if (!user) {
      summary.skipped += 1;
      addError(summary, username, 'no account with that username');
      continue;
    }
    const existing = await get(
      'SELECT * FROM tournament_players WHERE tournament_id = ? AND user_id = ?',
      [tournamentId, user.id]
    );
    const detail = typeof entry === 'object' ? entry : {};
    if (existing) {
      const patch = {};
      if (detail.deck !== undefined) patch.deck = detail.deck;
      if (detail.displayName !== undefined) patch.displayName = detail.displayName;
      if (detail.seed !== undefined) patch.seed = detail.seed;
      if (Object.keys(patch).length) await updatePlayer(existing.id, patch);
      summary.updated += 1;
      continue;
    }
    const res = await addPlayerByUsername(tournamentId, username);
    if (!res.ok) {
      summary.skipped += 1;
      addError(summary, username, res.error);
      continue;
    }
    const patch = {};
    if (detail.deck !== undefined) patch.deck = detail.deck;
    if (detail.displayName !== undefined) patch.displayName = detail.displayName;
    if (detail.seed !== undefined) patch.seed = detail.seed;
    if (Object.keys(patch).length) await updatePlayer(res.player.id, patch);
    summary.added += 1;
  }

  for (const row of update || []) {
    if (row?.id == null) {
      summary.skipped += 1;
      continue;
    }
    const res = await updatePlayer(Number(row.id), {
      deck: row.deck,
      displayName: row.displayName,
      seed: row.seed,
      dropped: row.dropped,
    });
    if (res.ok) summary.updated += 1;
    else {
      summary.skipped += 1;
      addError(summary, `player ${row.id}`, res.error);
    }
  }

  for (const id of remove || []) {
    const res = await removePlayer(Number(id));
    if (res.ok) summary.removed += 1;
    else {
      summary.skipped += 1;
      addError(summary, `player ${id}`, res.error);
    }
  }

  if (summary.added || summary.removed) {
    await logEvent({
      tournamentId,
      action: summary.added ? ACTIONS.PLAYER_ADDED : ACTIONS.PLAYER_REMOVED,
      actorId,
      summary: `Roster bulk update — ${summary.added} added, ${summary.updated} updated, ${summary.removed} removed`,
      details: { added: summary.added, updated: summary.updated, removed: summary.removed },
    });
  } else if (summary.updated) {
    emitChange(tournamentId, 'players_bulk_updated');
  }

  return { ok: true, summary, bundle: await getTournamentBundle(tournamentId) };
}

/* ------------------------------ Tournaments ------------------------------ */

export async function duplicateTournament(id, userId, { withPlayers = true, nameSuffix = ' (copy)' } = {}) {
  const t = await getTournament(id);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  const res = await createTournament(
    {
      name: `${t.name}${nameSuffix}`,
      gameId: t.game_id,
      format: t.format,
      bestOf: t.best_of,
      allowDraws: !!t.allow_draws,
      timeRule: t.time_rule,
      pointsWin: t.points_win,
      pointsDraw: t.points_draw,
      pointsLoss: t.points_loss,
      roundsOverride: t.rounds_override,
      maxPlayers: t.max_players,
      registrationOpen: !!t.registration_open,
      viewPublic: !!t.view_public,
      description: t.description,
    },
    userId
  );
  if (!res.ok) return res;

  if (withPlayers) {
    const players = await all(
      'SELECT * FROM tournament_players WHERE tournament_id = ? AND is_bye = 0 ORDER BY id',
      [id]
    );
    for (const p of players) {
      const added = await registerPlayer(res.tournament.id, p.user_id);
      if (added.ok && added.player && (p.deck || p.display_name || p.seed)) {
        await updatePlayer(added.player.id, {
          deck: p.deck,
          displayName: p.display_name,
          seed: p.seed,
        });
      }
    }
  }
  return { ok: true, tournament: res.tournament };
}

export async function bulkTournaments({ create = [], duplicate = [], remove = [], archive = [] }, userId) {
  const summary = { created: 0, duplicated: 0, updated: 0, removed: 0, skipped: 0, errors: [] };
  const touched = new Set();

  for (const [i, row] of (create || []).entries()) {
    const res = await createTournament(row || {}, userId);
    if (res.ok) {
      summary.created += 1;
      if (res.tournament?.id) touched.add(Number(res.tournament.id));
    } else {
      summary.skipped += 1;
      addError(summary, row?.name || `row ${i + 1}`, res.error);
    }
  }

  for (const id of duplicate || []) {
    const res = await duplicateTournament(Number(id), userId);
    if (res.ok) {
      summary.duplicated += 1;
      if (res.tournament?.id) touched.add(Number(res.tournament.id));
    } else {
      summary.skipped += 1;
      addError(summary, `tournament ${id}`, res.error);
    }
  }

  for (const id of archive || []) {
    const res = await updateTournament(Number(id), { status: 'completed' });
    if (res.ok) {
      summary.updated += 1;
      touched.add(Number(id));
    } else {
      summary.skipped += 1;
      addError(summary, `tournament ${id}`, res.error);
    }
  }

  for (const id of remove || []) {
    const res = await deleteTournament(Number(id));
    if (res.ok) {
      summary.removed += 1;
      touched.add(Number(id));
    } else {
      summary.skipped += 1;
      addError(summary, `tournament ${id}`, res.error);
    }
  }

  for (const id of touched) emitChange(id, 'bulk');

  return { ok: true, summary };
}

/* -------------------------------- Matches -------------------------------- */

export async function bulkMatches(tournamentId, { results = [], approve = [], approveAll = false, reset = [] }, userId) {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  const summary = { recorded: 0, approved: 0, reset: 0, skipped: 0, errors: [] };

  for (const row of results || []) {
    if (row?.id == null) {
      summary.skipped += 1;
      continue;
    }
    const payload = {};
    if (row.score1 !== undefined) payload.score1 = Number(row.score1);
    if (row.score2 !== undefined) payload.score2 = Number(row.score2);
    if (row.winnerId !== undefined && row.winnerId !== null && row.winnerId !== '') {
      payload.winnerId = Number(row.winnerId);
    }
    const res = await setMatchResult(Number(row.id), userId, payload);
    if (res.ok) summary.recorded += 1;
    else {
      summary.skipped += 1;
      addError(summary, `match ${row.id}`, res.error);
    }
  }

  for (const id of approve || []) {
    const res = await approveMatch(Number(id), userId, {});
    if (res.ok) summary.approved += 1;
    else {
      summary.skipped += 1;
      addError(summary, `match ${id}`, res.error);
    }
  }

  if (approveAll) {
    const reported = await all(
      "SELECT id FROM matches WHERE tournament_id = ? AND status = 'reported' ORDER BY id",
      [tournamentId]
    );
    for (const m of reported) {
      const res = await approveMatch(m.id, userId, {});
      if (res.ok) summary.approved += 1;
      else {
        summary.skipped += 1;
        addError(summary, `match ${m.id}`, res.error);
      }
    }
  }

  for (const id of reset || []) {
    const res = await resetReport(Number(id), userId);
    if (res.ok) summary.reset += 1;
    else {
      summary.skipped += 1;
      addError(summary, `match ${id}`, res.error);
    }
  }

  if (summary.recorded || summary.approved || summary.reset) {
    emitChange(tournamentId, 'matches_bulk');
  }

  return { ok: true, summary, bundle: await getTournamentBundle(tournamentId) };
}
