import { get, all, run } from '../db.js';
import { getTournament, listPlayers } from './tournaments.js';
import { toSwissPlayers, computeStandings } from './standings.js';
import { logEvent, emitChange, ACTIONS } from './log.js';
import { pairSwiss } from '../pairing/swiss.js';
import { buildRoundRobin } from '../pairing/roundRobin.js';
import { buildSingleElim } from '../pairing/singleElim.js';
import { buildDoubleElim } from '../pairing/doubleElim.js';

const BYE = 'BYE';

function isByeValue(v) {
  return v === BYE;
}

// Human label for a slot value using an already-loaded roster.
function playerLabel(players, id) {
  if (id == null || isByeValue(id)) return 'BYE';
  const p = players.find((x) => Number(x.id) === Number(id));
  if (!p) return `Player ${id}`;
  return p.display_name || p.user_name || p.name || `Player ${id}`;
}

async function loadLabels(ids) {
  const unique = [...new Set(ids.filter((id) => id != null && !isByeValue(id)).map(Number))];
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => '?').join(', ');
  const rows = await all(
    `SELECT tp.id, tp.display_name, u.name AS user_name FROM tournament_players tp
     LEFT JOIN users u ON u.id = tp.user_id WHERE tp.id IN (${placeholders})`,
    unique
  );
  const map = new Map();
  for (const r of rows) map.set(Number(r.id), r.display_name || r.user_name || `Player ${r.id}`);
  return map;
}

// --- match generation -------------------------------------------------------

async function insertMatch(tournamentId, def) {
  const bye1 = isByeValue(def.player1_id) ? 1 : 0;
  const bye2 = isByeValue(def.player2_id) ? 1 : 0;
  const p1 = bye1 ? null : def.player1_id ?? null;
  const p2 = bye2 ? null : def.player2_id ?? null;
  const result = await run(
    `INSERT INTO matches
      (tournament_id, round, bracket, match_index, slot_key, label,
       player1_id, player2_id, player1_is_bye, player2_is_bye, is_bye, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tournamentId,
      def.round,
      def.bracket,
      def.index,
      def.key,
      def.label || def.key,
      p1,
      p2,
      bye1,
      bye2,
      bye1 || bye2 ? 1 : 0,
      def.status || 'pending',
    ]
  );
  return result.lastInsertRowid;
}

async function generateStructure(tournamentId, defs) {
  const idByKey = new Map();
  for (const def of defs) {
    const id = await insertMatch(tournamentId, def);
    idByKey.set(def.key, id);
  }
  for (const def of defs) {
    const id = idByKey.get(def.key);
    const winnerTo = def.winner_to ? idByKey.get(def.winner_to.key) ?? null : null;
    const loserTo = def.loser_to ? idByKey.get(def.loser_to.key) ?? null : null;
    await run(
      `UPDATE matches SET winner_to_match = ?, winner_to_slot = ?, loser_to_match = ?, loser_to_slot = ?
       WHERE id = ?`,
      [winnerTo, def.winner_to?.slot ?? null, loserTo, def.loser_to?.slot ?? null, id]
    );
  }
}

// Build the defs for a Swiss round from the current standings.
async function swissRoundDefs(tournament, round) {
  const rawPlayers = await listPlayers(tournament.id);
  const matches = await all('SELECT * FROM matches WHERE tournament_id = ?', [tournament.id]);
  const swissPlayers = toSwissPlayers({
    players: rawPlayers.filter((p) => !Number(p.is_bye)),
    matches,
    points: { win: tournament.points_win, draw: tournament.points_draw, loss: tournament.points_loss },
  });
  const { pairings, bye } = pairSwiss(swissPlayers);

  const defs = pairings.map((p, i) => ({
    key: `S${round}-${i}`,
    round,
    bracket: 'swiss',
    index: i,
    label: `Table ${i + 1}`,
    player1_id: p.player1_id,
    player2_id: p.player2_id,
    winner_to: null,
    loser_to: null,
  }));
  if (bye != null) {
    defs.push({
      key: `S${round}-bye`,
      round,
      bracket: 'swiss',
      index: pairings.length,
      label: 'Bye',
      player1_id: bye,
      player2_id: BYE,
      winner_to: null,
      loser_to: null,
      status: 'approved',
    });
  }
  return defs;
}

// --- start ------------------------------------------------------------------

export async function startTournament(id, actorId = null) {
  const t = await getTournament(id);
  if (!t) return { ok: false, status: 404, error: 'Tournament not found' };
  if (t.status === 'active') return { ok: false, status: 400, error: 'Tournament already started' };
  if (!['registration', 'draft'].includes(t.status)) {
    return { ok: false, status: 400, error: 'This tournament cannot be started' };
  }

  const players = (await listPlayers(id)).filter((p) => !Number(p.is_bye) && !Number(p.dropped));
  if (players.length < 2) return { ok: false, status: 400, error: 'At least 2 players are required to start' };

  for (let i = 0; i < players.length; i += 1) {
    await run('UPDATE tournament_players SET seed = ?, losses = 0, eliminated = 0 WHERE id = ?', [i + 1, players[i].id]);
  }
  const ids = players.map((p) => p.id);

  if (t.format === 'swiss') {
    const total = t.rounds_override || Math.max(1, Math.ceil(Math.log2(ids.length)));
    await run('UPDATE tournaments SET total_rounds = ?, current_round = 1 WHERE id = ?', [total, id]);
    const fresh = await getTournament(id);
    await generateStructure(id, await swissRoundDefs(fresh, 1));
  } else if (t.format === 'round_robin') {
    const rounds = buildRoundRobin(ids);
    const defs = [];
    rounds.forEach((round, rIdx) => {
      round.forEach((pair, mIdx) => {
        const isBye = pair.player2_id == null;
        defs.push({
          key: `R${rIdx + 1}-${mIdx}`,
          round: rIdx + 1,
          bracket: 'round_robin',
          index: mIdx,
          label: `Round ${rIdx + 1} · Match ${mIdx + 1}`,
          player1_id: pair.player1_id,
          player2_id: isBye ? BYE : pair.player2_id,
          winner_to: null,
          loser_to: null,
          status: isBye ? 'approved' : 'pending',
        });
      });
    });
    await run('UPDATE tournaments SET total_rounds = ?, current_round = 1 WHERE id = ?', [rounds.length, id]);
    await generateStructure(id, defs);
  } else if (t.format === 'single_elim') {
    const { rounds, matches } = buildSingleElim(ids);
    await run('UPDATE tournaments SET total_rounds = ?, current_round = 1 WHERE id = ?', [rounds, id]);
    await generateStructure(id, matches);
  } else if (t.format === 'double_elim') {
    const { rounds, matches, resetKey } = buildDoubleElim(ids);
    const defs = matches.map((m) => (m.key === resetKey ? { ...m, status: 'waiting' } : m));
    await run('UPDATE tournaments SET total_rounds = ?, current_round = 1 WHERE id = ?', [rounds, id]);
    await generateStructure(id, defs);
  } else {
    return { ok: false, status: 400, error: 'Unknown tournament format' };
  }

  await run("UPDATE tournaments SET status = 'active', started_at = datetime('now') WHERE id = ?", [id]);
  await logEvent({
    tournamentId: id,
    round: 1,
    action: ACTIONS.STARTED,
    actorId,
    summary: `Started with ${players.length} player${players.length === 1 ? '' : 's'}`,
    details: { format: t.format, seedOrder: players.map((p) => Number(p.id)) },
  });
  await autoResolve(id, actorId);
  await afterResolution(id, actorId);
  return { ok: true };
}

// --- bye auto-resolution & advancement --------------------------------------

function slotValue(match, slot) {
  return slot === 1 ? match.player1_id : match.player2_id;
}
function slotIsBye(match, slot) {
  return Number(slot === 1 ? match.player1_is_bye : match.player2_is_bye) === 1;
}
function slotDetermined(match, slot) {
  return slotValue(match, slot) != null || slotIsBye(match, slot);
}

async function setSlot(matchId, slot, value) {
  const bye = isByeValue(value) ? 1 : 0;
  const id = bye ? null : value;
  const col = slot === 1 ? 'player1_id' : 'player2_id';
  const byeCol = slot === 1 ? 'player1_is_bye' : 'player2_is_bye';
  await run(`UPDATE matches SET ${col} = ?, ${byeCol} = ? WHERE id = ?`, [id, bye, matchId]);
}

async function propagate(match, winnerValue, loserValue) {
  if (match.winner_to_match) {
    await setSlot(match.winner_to_match, match.winner_to_slot, winnerValue);
  }
  if (match.loser_to_match) {
    await setSlot(match.loser_to_match, match.loser_to_slot, loserValue);
  }
}

// Resolve any match whose outcome is forced because a slot is a bye.
export async function autoResolve(tournamentId, actorId = null) {
  let changed = true;
  let guard = 0;
  const resolved = [];
  while (changed && guard < 1000) {
    guard += 1;
    changed = false;
    const pending = await all(
      "SELECT * FROM matches WHERE tournament_id = ? AND status = 'pending'",
      [tournamentId]
    );
    for (const m of pending) {
      if (!slotDetermined(m, 1) || !slotDetermined(m, 2)) continue;
      const b1 = slotIsBye(m, 1);
      const b2 = slotIsBye(m, 2);
      if (!b1 && !b2) continue; // real vs real — needs a result

      let winnerId = null;
      let winnerValue = BYE;
      if (b1 && b2) {
        winnerValue = BYE;
      } else if (b1) {
        winnerId = m.player2_id;
        winnerValue = m.player2_id;
      } else {
        winnerId = m.player1_id;
        winnerValue = m.player1_id;
      }
      await run(
        "UPDATE matches SET status = 'approved', is_bye = 1, winner_id = ?, approved_at = datetime('now') WHERE id = ?",
        [winnerId, m.id]
      );
      await propagate(m, winnerValue, BYE);
      resolved.push({ match: m, winnerId });
      changed = true;
    }
  }

  if (resolved.length) {
    const labels = await loadLabels(resolved.flatMap((r) => [r.match.player1_id, r.match.player2_id]));
    for (const r of resolved) {
      const label = r.winnerId != null ? labels.get(Number(r.winnerId)) || `Player ${r.winnerId}` : null;
      await logEvent({
        tournamentId,
        matchId: r.match.id,
        round: r.match.round,
        action: ACTIONS.BYE,
        actorId,
        summary: label ? `Bye — ${label} advances` : 'Bye — both slots empty',
        details: { bracket: r.match.bracket },
        silent: true,
      });
    }
    emitChange(tournamentId, ACTIONS.BYE);
  }
}

async function recordLoss(tournament, loserId) {
  if (loserId == null || isByeValue(loserId)) return;
  if (tournament.format === 'swiss' || tournament.format === 'round_robin') return;
  const threshold = tournament.format === 'double_elim' ? 2 : 1;
  await run('UPDATE tournament_players SET losses = losses + 1 WHERE id = ?', [loserId]);
  await run(
    `UPDATE tournament_players SET eliminated = CASE WHEN losses >= ? THEN 1 ELSE 0 END WHERE id = ?`,
    [threshold, loserId]
  );
}

// Approve a match with a known winner and push the result through the bracket.
async function finalizeMatch(tournament, match, winnerSlot, { draw = false, scores = {} } = {}) {
  const winnerId = draw ? null : slotValue(match, winnerSlot);
  const loserSlot = winnerSlot === 1 ? 2 : 1;
  const loserValue = draw ? BYE : slotValue(match, loserSlot);

  await run(
    `UPDATE matches SET status = 'approved', winner_id = ?, is_draw = ?, score1 = ?, score2 = ?,
       approved_at = datetime('now'), dispute_reason = NULL, disputed_by = NULL, disputed_at = NULL
     WHERE id = ?`,
    [winnerId, draw ? 1 : 0, scores.score1 ?? null, scores.score2 ?? null, match.id]
  );

  if (!draw) {
    await propagate(match, isByeValue(winnerId) ? BYE : winnerId, loserValue);
    await recordLoss(tournament, loserValue);
  } else {
    await propagate(match, BYE, BYE);
  }
}

function winningSlot(match, score1, score2) {
  const s1 = Number(score1);
  const s2 = Number(score2);
  if (s1 === s2) return null;
  return s1 > s2 ? 1 : 2;
}

function validateScores(tournament, score1, score2) {
  const s1 = Number(score1);
  const s2 = Number(score2);
  if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0) {
    return 'Scores must be non-negative whole numbers';
  }
  const cap = Math.ceil(tournament.best_of / 2);
  if (s1 > cap || s2 > cap) return `A best-of-${tournament.best_of} match can have at most ${cap} games won per side`;
  if (s1 === s2) {
    if (tournament.format === 'swiss' || tournament.format === 'round_robin') {
      if (!Number(tournament.allow_draws)) return 'Draws are not allowed in this tournament';
    } else {
      return 'Elimination matches cannot end in a draw';
    }
  } else if (Math.max(s1, s2) !== cap) {
    return `The winning player must reach ${cap} game win(s)`;
  }
  return null;
}

// --- results ----------------------------------------------------------------

export async function reportMatch(matchId, userId, { score1, score2 }) {
  const match = await get('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return { ok: false, status: 404, error: 'Match not found' };
  const tournament = await getTournament(match.tournament_id);
  if (!tournament || tournament.status !== 'active') {
    return { ok: false, status: 400, error: 'This tournament is not active' };
  }
  if (match.status !== 'pending') return { ok: false, status: 400, error: 'This match already has a result' };
  if (slotIsBye(match, 1) || slotIsBye(match, 2)) return { ok: false, status: 400, error: 'This is a bye' };

  const players = await listPlayers(tournament.id);
  const myPlayer = players.find((p) => p.user_id === userId);
  if (!myPlayer || (myPlayer.id !== match.player1_id && myPlayer.id !== match.player2_id)) {
    return { ok: false, status: 403, error: 'You are not a participant in this match' };
  }
  const error = validateScores(tournament, score1, score2);
  if (error) return { ok: false, status: 400, error };

  await run(
    "UPDATE matches SET score1 = ?, score2 = ?, status = 'reported', reported_by = ?, reported_at = datetime('now') WHERE id = ?",
    [Number(score1), Number(score2), userId, matchId]
  );
  await logEvent({
    tournamentId: match.tournament_id,
    matchId,
    round: match.round,
    action: ACTIONS.REPORTED,
    actorId: userId,
    summary: `${playerLabel(players, match.player1_id)} ${score1}-${score2} ${playerLabel(players, match.player2_id)} reported`,
    details: { score1: Number(score1), score2: Number(score2) },
  });
  return { ok: true, match: await get('SELECT * FROM matches WHERE id = ?', [matchId]) };
}

export async function approveMatch(matchId, adminId, { score1, score2 } = {}) {
  const match = await get('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return { ok: false, status: 404, error: 'Match not found' };
  const tournament = await getTournament(match.tournament_id);
  if (!tournament || tournament.status !== 'active') {
    return { ok: false, status: 400, error: 'This tournament is not active' };
  }
  if (match.status === 'approved') return { ok: false, status: 400, error: 'This match is already finalized' };
  if (!['reported', 'disputed'].includes(match.status)) {
    return { ok: false, status: 400, error: 'This match is not awaiting approval' };
  }
  if (slotIsBye(match, 1) || slotIsBye(match, 2) || !slotDetermined(match, 1) || !slotDetermined(match, 2)) {
    return { ok: false, status: 400, error: 'This match is not ready to be finalized' };
  }

  // Admin may pass (corrected) scores; otherwise use the reported ones.
  const s1 = score1 !== undefined ? Number(score1) : Number(match.score1);
  const s2 = score2 !== undefined ? Number(score2) : Number(match.score2);
  const error = validateScores(tournament, s1, s2);
  if (error) return { ok: false, status: 400, error };

  const winSlot = winningSlot(match, s1, s2);
  await finalizeMatch(tournament, match, winSlot, {
    draw: winSlot === null,
    scores: { score1: s1, score2: s2 },
  });
  await finalizeByAdmin(matchId, adminId);
  const labels = await loadLabels([match.player1_id, match.player2_id]);
  await logEvent({
    tournamentId: tournament.id,
    matchId,
    round: match.round,
    action: ACTIONS.APPROVED,
    actorId: adminId,
    summary: `Approved ${labels.get(Number(match.player1_id)) || '—'} ${s1}-${s2} ${
      labels.get(Number(match.player2_id)) || '—'
    }`,
    details: { score1: s1, score2: s2, draw: winSlot === null },
  });
  await afterResolution(tournament.id, adminId);
  return { ok: true };
}

async function finalizeByAdmin(matchId, adminId) {
  await run('UPDATE matches SET approved_by = ? WHERE id = ?', [adminId, matchId]);
}

export async function setMatchResult(matchId, adminId, { score1, score2, winnerId }) {
  const match = await get('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return { ok: false, status: 404, error: 'Match not found' };
  const tournament = await getTournament(match.tournament_id);
  if (!tournament || tournament.status !== 'active') {
    return { ok: false, status: 400, error: 'This tournament is not active' };
  }
  if (match.status === 'approved') {
    return { ok: false, status: 400, error: 'This match is already finalized' };
  }
  if (slotIsBye(match, 1) || slotIsBye(match, 2) || !slotDetermined(match, 1) || !slotDetermined(match, 2)) {
    return { ok: false, status: 400, error: 'This match is not ready to be finalized' };
  }

  // Direct winner selection (walkover / correction) without a score.
  if (winnerId != null && (score1 === undefined || score2 === undefined)) {
    const winSlot = Number(winnerId) === Number(match.player1_id) ? 1 : 2;
    if (Number(winnerId) !== Number(match.player1_id) && Number(winnerId) !== Number(match.player2_id)) {
      return { ok: false, status: 400, error: 'Winner is not part of this match' };
    }
    await finalizeMatch(tournament, match, winSlot, { scores: {} });
    await finalizeByAdmin(matchId, adminId);
    const walkoverLabels = await loadLabels([winnerId, match.player1_id, match.player2_id]);
    const walkoverWinner = walkoverLabels.get(Number(winnerId));
    await logEvent({
      tournamentId: tournament.id,
      matchId,
      round: match.round,
      action: ACTIONS.RESULT_SET,
      actorId: adminId,
      summary: `Set winner — ${walkoverWinner || '—'} advances (no score)`,
      details: { winnerId: Number(winnerId), walkover: true },
    });
    await afterResolution(tournament.id, adminId);
    return { ok: true };
  }

  const s1 = Number(score1);
  const s2 = Number(score2);
  const error = validateScores(tournament, s1, s2);
  if (error) return { ok: false, status: 400, error };
  const winSlot = winningSlot(match, s1, s2);
  await finalizeMatch(tournament, match, winSlot, { draw: winSlot === null, scores: { score1: s1, score2: s2 } });
  await finalizeByAdmin(matchId, adminId);
  const labels = await loadLabels([match.player1_id, match.player2_id]);
  await logEvent({
    tournamentId: tournament.id,
    matchId,
    round: match.round,
    action: ACTIONS.RESULT_SET,
    actorId: adminId,
    summary: `Recorded ${labels.get(Number(match.player1_id)) || '—'} ${s1}-${s2} ${
      labels.get(Number(match.player2_id)) || '—'
    }`,
    details: { score1: s1, score2: s2, draw: winSlot === null },
  });
  await afterResolution(tournament.id, adminId);
  return { ok: true };
}

export async function disputeMatch(matchId, userId, { reason } = {}) {
  const match = await get('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return { ok: false, status: 404, error: 'Match not found' };
  const tournament = await getTournament(match.tournament_id);
  if (!tournament || tournament.status !== 'active') {
    return { ok: false, status: 400, error: 'This tournament is not active' };
  }
  if (match.status !== 'reported') {
    return { ok: false, status: 400, error: 'Only a reported result can be disputed' };
  }
  const players = await listPlayers(tournament.id);
  const me = players.find((p) => Number(p.user_id) === Number(userId));
  if (!me || (Number(me.id) !== Number(match.player1_id) && Number(me.id) !== Number(match.player2_id))) {
    return { ok: false, status: 403, error: 'You are not a participant in this match' };
  }
  const note = reason ? String(reason).trim().slice(0, 300) : null;
  await run(
    "UPDATE matches SET status = 'disputed', dispute_reason = ?, disputed_by = ?, disputed_at = datetime('now') WHERE id = ?",
    [note, userId, matchId]
  );
  const labels = await loadLabels([match.player1_id, match.player2_id]);
  await logEvent({
    tournamentId: tournament.id,
    matchId,
    round: match.round,
    action: ACTIONS.DISPUTED,
    actorId: userId,
    summary: `Disputed ${labels.get(Number(match.player1_id)) || '—'} ${match.score1 ?? '–'}-${match.score2 ?? '–'} ${labels.get(Number(match.player2_id)) || '—'}${note ? ` — ${note}` : ''}`,
    details: { reason: note, score1: match.score1, score2: match.score2 },
  });
  return { ok: true };
}

export async function resetReport(matchId, actorId = null) {
  const match = await get('SELECT * FROM matches WHERE id = ?', [matchId]);
  if (!match) return { ok: false, status: 404, error: 'Match not found' };
  if (!['reported', 'disputed'].includes(match.status)) {
    return { ok: false, status: 400, error: 'Only a reported or disputed result can be cleared' };
  }
  await run(
    `UPDATE matches SET score1 = NULL, score2 = NULL, status = 'pending', reported_by = NULL,
       reported_at = NULL, dispute_reason = NULL, disputed_by = NULL, disputed_at = NULL
     WHERE id = ?`,
    [matchId]
  );
  const labels = await loadLabels([match.player1_id, match.player2_id]);
  await logEvent({
    tournamentId: match.tournament_id,
    matchId,
    round: match.round,
    action: ACTIONS.RESET,
    actorId,
    summary: `Cleared result ${labels.get(Number(match.player1_id)) || '—'} ${match.score1 ?? '–'}-${
      match.score2 ?? '–'
    } ${labels.get(Number(match.player2_id)) || '—'}`,
    details: { previousScore1: match.score1, previousScore2: match.score2 },
  });
  return { ok: true };
}

// --- progression ------------------------------------------------------------

async function incompleteCount(tournamentId, { round = null, bracket = null } = {}) {
  const where = ["tournament_id = ?", "status IN ('pending', 'reported')"];
  const args = [tournamentId];
  if (round != null) {
    where.push('round = ?');
    args.push(round);
  }
  if (bracket) {
    where.push('bracket = ?');
    args.push(bracket);
  }
  const row = await get(`SELECT COUNT(*) AS c FROM matches WHERE ${where.join(' AND ')}`, args);
  return Number(row.c);
}

async function completeTournament(id, actorId = null) {
  await run(
    "UPDATE tournaments SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
    [id]
  );
  const t = await getTournament(id);
  const players = (await listPlayers(id)).filter((p) => !Number(p.is_bye));
  const standings = await computeStandings({
    players,
    matches: await all('SELECT * FROM matches WHERE tournament_id = ?', [id]),
    points: { win: t.points_win, draw: t.points_draw, loss: t.points_loss },
  });
  const winner = standings.find((s) => s.rank === 1) || standings[0];
  await logEvent({
    tournamentId: id,
    round: t.current_round || null,
    action: ACTIONS.COMPLETED,
    actorId,
    summary: winner ? `Completed — ${winner.name} takes 1st` : 'Completed',
    details: winner ? { champion: { id: winner.id, name: winner.name } } : null,
  });
}

export async function afterResolution(tournamentId, actorId = null) {
  await autoResolve(tournamentId, actorId);
  const t = await getTournament(tournamentId);
  if (!t || t.status !== 'active') return;

  if (t.format === 'swiss') {
    const remaining = await incompleteCount(tournamentId, { round: t.current_round, bracket: 'swiss' });
    if (remaining === 0) {
      if (t.current_round < (t.total_rounds || 0)) {
        const next = t.current_round + 1;
        await generateStructure(tournamentId, await swissRoundDefs(t, next));
        await run('UPDATE tournaments SET current_round = ? WHERE id = ?', [next, tournamentId]);
        await logEvent({
          tournamentId,
          round: next,
          action: ACTIONS.ROUND_ADVANCED,
          actorId,
          summary: `Round ${t.current_round} complete — round ${next} pairings generated`,
          details: { from: t.current_round, to: next },
        });
        await autoResolve(tournamentId, actorId);
      } else {
        await completeTournament(tournamentId, actorId);
      }
    }
    return;
  }

  if (t.format === 'round_robin') {
    if ((await incompleteCount(tournamentId)) === 0) await completeTournament(tournamentId, actorId);
    return;
  }

  if (t.format === 'single_elim') {
    const final = await get(
      "SELECT * FROM matches WHERE tournament_id = ? AND bracket = 'main' ORDER BY round DESC, match_index ASC LIMIT 1",
      [tournamentId]
    );
    if (final && final.status === 'approved') await completeTournament(tournamentId, actorId);
    return;
  }

  if (t.format === 'double_elim') {
    const gf2 = await get("SELECT * FROM matches WHERE tournament_id = ? AND slot_key = 'GF2'", [tournamentId]);
    if (gf2 && gf2.status === 'approved') {
      await completeTournament(tournamentId, actorId);
      return;
    }
    const gf1 = await get("SELECT * FROM matches WHERE tournament_id = ? AND slot_key = 'GF1'", [tournamentId]);
    if (gf1 && gf1.status === 'approved') {
      if (Number(gf1.winner_id) === Number(gf1.player2_id)) {
        // Losers-bracket player won the first final -> reset match.
        await run(
          `UPDATE matches SET player1_id = ?, player2_id = ?, player1_is_bye = 0, player2_is_bye = 0,
             status = 'pending', score1 = NULL, score2 = NULL, winner_id = NULL, is_draw = 0
           WHERE id = ?`,
          [gf1.player1_id, gf1.player2_id, gf2.id]
        );
        await logEvent({
          tournamentId,
          matchId: gf2.id,
          round: gf2.round,
          action: ACTIONS.GF_RESET,
          actorId,
          summary: 'Grand final reset — losers-bracket player forced game 2',
          details: { matchId: gf2.id },
        });
      } else {
        await completeTournament(tournamentId, actorId);
      }
    }
  }
}

// Convenience for the standings/management view (recomputed on demand).
export async function currentStandings(tournamentId) {
  const t = await getTournament(tournamentId);
  const players = await listPlayers(tournamentId);
  const matches = await all('SELECT * FROM matches WHERE tournament_id = ?', [tournamentId]);
  return computeStandings({
    players,
    matches,
    points: { win: t.points_win, draw: t.points_draw, loss: t.points_loss },
  });
}
