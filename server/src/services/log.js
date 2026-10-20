import { get, all, run } from '../db.js';
import { emitTournamentChanged } from './events.js';

// Append-only audit trail. Every recorded event also nudges live subscribers
// to refetch the tournament, so the UI stays in sync with real state changes.

export const ACTIONS = {
  STARTED: 'started',
  COMPLETED: 'completed',
  REPORTED: 'reported',
  APPROVED: 'approved',
  RESULT_SET: 'result_set',
  RESET: 'reset',
  BYE: 'bye',
  ROUND_ADVANCED: 'round_advanced',
  GF_RESET: 'gf_reset',
  SEEDS_SET: 'seeds_set',
  REGISTERED: 'registered',
  UNREGISTERED: 'unregistered',
  CHECKED_IN: 'checked_in',
  PLAYER_ADDED: 'player_added',
  PLAYER_REMOVED: 'player_removed',
  DECK_REVIEWED: 'deck_reviewed',
  DISPUTED: 'disputed',
};

async function resolveActorName(actorId, actorName) {
  if (actorName) return actorName;
  if (actorId == null) return 'System';
  const row = await get('SELECT name FROM users WHERE id = ?', [actorId]);
  return row?.name || `User ${actorId}`;
}

export async function logEvent({
  tournamentId,
  matchId = null,
  round = null,
  action,
  actorId = null,
  actorName = null,
  summary = '',
  details = null,
  silent = false,
}) {
  if (tournamentId == null) return null;
  const name = await resolveActorName(actorId, actorName);
  const result = await run(
    `INSERT INTO match_events (tournament_id, match_id, round, action, actor_id, actor_name, summary, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(tournamentId),
      matchId == null ? null : Number(matchId),
      round == null ? null : Number(round),
      action,
      actorId == null ? null : Number(actorId),
      name,
      summary || '',
      details ? JSON.stringify(details) : null,
    ]
  );
  if (!silent) emitTournamentChanged(tournamentId, action);
  return result.lastInsertRowid;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function listEvents(tournamentId, { limit = 200, includeActor = true } = {}) {
  const rows = await all(
    'SELECT * FROM match_events WHERE tournament_id = ? ORDER BY id DESC LIMIT ?',
    [Number(tournamentId), limit]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    tournamentId: Number(r.tournament_id),
    matchId: r.match_id == null ? null : Number(r.match_id),
    round: r.round == null ? null : Number(r.round),
    action: r.action,
    actorId: includeActor && r.actor_id != null ? Number(r.actor_id) : null,
    actor: includeActor ? r.actor_name : null,
    summary: r.summary || '',
    details: r.details ? safeParse(r.details) : null,
    createdAt: r.created_at,
  }));
}

export function emitChange(tournamentId, reason = 'update') {
  emitTournamentChanged(tournamentId, reason);
}

export async function countEvents(tournamentId) {
  const row = await get('SELECT COUNT(*) AS c FROM match_events WHERE tournament_id = ?', [
    Number(tournamentId),
  ]);
  return Number(row?.c || 0);
}
