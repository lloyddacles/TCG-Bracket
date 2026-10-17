import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_URL = `file:${path.join(os.tmpdir(), `tcg-test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)}`;
process.env.JWT_SECRET = 'test-secret';

const { initDb } = await import('../src/db.js');
await initDb();
const { ensureAdmin } = await import('../src/bootstrap.js');
await ensureAdmin();
const tournaments = await import('../src/services/tournaments.js');
const engine = await import('../src/services/engine.js');
const { createUser } = await import('../src/services/users.js');

let seq = 0;
async function makeUser(role = 'player') {
  seq += 1;
  return createUser({ username: `u${seq}_${Date.now()}`, password: 'secret123', name: `User ${seq}`, role });
}

async function setup(format, playerCount, extra = {}) {
  const admin = await makeUser('admin');
  const result = await tournaments.createTournament(
    { name: `${format} test`, gameId: 1, format, ...extra },
    admin.id
  );
  const players = [];
  for (let i = 0; i < playerCount; i += 1) {
    const u = await makeUser('player');
    await tournaments.registerPlayer(result.tournament.id, u.id);
    players.push(u);
  }
  return { admin, tournamentId: result.tournament.id, players };
}

async function refresh(id) {
  return tournaments.getTournamentBundle(id);
}

async function playOut(adminId, tournamentId, { loserOfFinal = null, stopAtGF2 = false } = {}) {
  for (let iter = 0; iter < 1000; iter += 1) {
    const bundle = await refresh(tournamentId);
    if (bundle.tournament.status !== 'active') return bundle;
    const playable = bundle.matches.filter(
      (m) =>
        m.status === 'pending' &&
        !Number(m.player1_is_bye) &&
        !Number(m.player2_is_bye) &&
        m.player1_id != null &&
        m.player2_id != null &&
        !(stopAtGF2 && m.slot_key === 'GF2')
    );
    if (!playable.length) return bundle;
    const match = playable[0];
    let winnerId = match.player1_id;
    if (loserOfFinal && match.bracket === 'grand_final' && match.slot_key === 'GF1') {
      winnerId = match.player2_id;
    }
    const res = await engine.setMatchResult(match.id, adminId, { winnerId });
    assert.ok(res.ok, `setMatchResult failed: ${res.error}`);
  }
  throw new Error('playOut did not terminate');
}

test('swiss runs the configured number of rounds and produces a champion', async () => {
  const { admin, tournamentId } = await setup('swiss', 8);
  await engine.startTournament(tournamentId);
  let bundle = await refresh(tournamentId);
  assert.equal(bundle.tournament.status, 'active');
  assert.equal(bundle.matches.filter((m) => m.round === 1).length, 4);

  bundle = await playOut(admin.id, tournamentId);
  assert.equal(bundle.tournament.status, 'completed');
  assert.equal(bundle.standings[0].matchWins, 3);
  assert.ok(bundle.champion);
});

test('single elimination advances winners and crowns one champion', async () => {
  const { admin, tournamentId } = await setup('single_elim', 5);
  await engine.startTournament(tournamentId);
  let bundle = await refresh(tournamentId);
  assert.equal(bundle.matches.length, 7); // 4 + 2 + 1
  assert.equal(bundle.tournament.status, 'active');

  bundle = await playOut(admin.id, tournamentId);
  assert.equal(bundle.tournament.status, 'completed');
  assert.ok(bundle.champion);
  const final = bundle.matches.find((m) => m.round === 3);
  assert.equal(final.status, 'approved');
});

test('round robin plays every pairing exactly once', async () => {
  const { admin, tournamentId } = await setup('round_robin', 5);
  await engine.startTournament(tournamentId);
  const bundle = await refresh(tournamentId);
  assert.equal(bundle.tournament.total_rounds, 5);
  const played = new Set();
  for (const m of bundle.matches) {
    if (m.player2_id == null) continue;
    played.add([m.player1_id, m.player2_id].sort((a, b) => a - b).join('-'));
  }
  assert.equal(played.size, (5 * 4) / 2);

  const done = await playOut(admin.id, tournamentId);
  assert.equal(done.tournament.status, 'completed');
  assert.ok(done.champion);
});

test('double elimination completes when the winners champion also wins the final', async () => {
  const { admin, tournamentId } = await setup('double_elim', 8);
  await engine.startTournament(tournamentId);
  const bundle = await playOut(admin.id, tournamentId);
  assert.equal(bundle.tournament.status, 'completed');
  assert.ok(bundle.champion);
  const gf2 = bundle.matches.find((m) => m.slot_key === 'GF2');
  assert.notEqual(gf2.status, 'approved');
});

test('double elimination triggers a bracket reset when the losers champion wins', async () => {
  const { admin, tournamentId } = await setup('double_elim', 4);
  await engine.startTournament(tournamentId);

  // Run to the grand final.
  let bundle = await playOut(admin.id, tournamentId, { loserOfFinal: true, stopAtGF2: true });
  const gf2 = bundle.matches.find((m) => m.slot_key === 'GF2');
  assert.equal(gf2.status, 'pending', 'GF2 should be activated after a losers-side win');

  // Now finish the reset match.
  const res = await engine.setMatchResult(gf2.id, admin.id, { winnerId: gf2.player1_id });
  assert.ok(res.ok, res.error);
  bundle = await refresh(tournamentId);
  assert.equal(bundle.tournament.status, 'completed');
});

test('reporting a match then approving it locks in the result', async () => {
  const { admin, tournamentId, players } = await setup('swiss', 4);
  await engine.startTournament(tournamentId);
  let bundle = await refresh(tournamentId);
  const match = bundle.matches.find((m) => m.status === 'pending');

  const reporter = players.find((p) => p.id === match.player1_id) || null;
  const reporterId = match.player1_id;
  // player1_id references tournament_players; find the matching user id.
  const playerRow = bundle.players.find((p) => p.id === reporterId);
  const report = await engine.reportMatch(match.id, playerRow.user_id, { score1: 2, score2: 1 });
  assert.ok(report.ok, report.error);

  bundle = await refresh(tournamentId);
  const reported = bundle.matches.find((m) => m.id === match.id);
  assert.equal(reported.status, 'reported');

  const approve = await engine.approveMatch(match.id, admin.id, {});
  assert.ok(approve.ok, approve.error);
  bundle = await refresh(tournamentId);
  const approved = bundle.matches.find((m) => m.id === match.id);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.winner_id, match.player1_id);
});

test('swiss with an odd number of players credits the bye', async () => {
  const { admin, tournamentId } = await setup('swiss', 7);
  await engine.startTournament(tournamentId);
  const bundle = await refresh(tournamentId);
  const byeMatches = bundle.matches.filter((m) => Number(m.is_bye));
  assert.equal(byeMatches.length, 1);
  const byePlayerId = byeMatches[0].player1_id;
  const byePlayer = bundle.standings.find((s) => s.id === byePlayerId);
  assert.equal(byePlayer.matchWins, 1);
  assert.equal(byePlayer.points, 3);
});

test('round robin with an odd number of players credits each bye', async () => {
  const { admin, tournamentId } = await setup('round_robin', 5);
  await engine.startTournament(tournamentId);
  const bundle = await refresh(tournamentId);
  const byeMatches = bundle.matches.filter((m) => Number(m.is_bye));
  assert.equal(byeMatches.length, 5);
  const totalByes = bundle.standings.reduce((acc, s) => acc + s.byes, 0);
  assert.equal(totalByes, 5);
  const done = await playOut(admin.id, tournamentId);
  assert.equal(done.tournament.status, 'completed');
});

test('rejects draws in elimination and validates scores', async () => {
  const { admin, tournamentId } = await setup('single_elim', 4);
  await engine.startTournament(tournamentId);
  const bundle = await refresh(tournamentId);
  const match = bundle.matches.find((m) => m.status === 'pending');
  const draw = await engine.setMatchResult(match.id, admin.id, { score1: 1, score2: 1 });
  assert.equal(draw.ok, false);
  const badScore = await engine.setMatchResult(match.id, admin.id, { score1: 5, score2: 0 });
  assert.equal(badScore.ok, false);
});
