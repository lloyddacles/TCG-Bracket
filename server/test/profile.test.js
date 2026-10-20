import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_URL = `file:${path.join(
  os.tmpdir(),
  `tcg-profile-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
)}`;
process.env.JWT_SECRET = 'test-secret';

const { initDb, get } = await import('../src/db.js');
await initDb();
const { ensureAdmin } = await import('../src/bootstrap.js');
await ensureAdmin();
const tournaments = await import('../src/services/tournaments.js');
const engine = await import('../src/services/engine.js');
const profile = await import('../src/services/profile.js');
const { listEvents, countEvents } = await import('../src/services/log.js');
const { createUser, getUser } = await import('../src/services/users.js');

let seq = 0;
async function makeUser(role = 'player') {
  seq += 1;
  return createUser({
    username: `pf${seq}_${Date.now()}`,
    password: 'secret123',
    name: `Profile User ${seq}`,
    role,
  });
}

async function makePlayers(n) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(await makeUser('player'));
  return out;
}

async function createRR(name, users, actorId) {
  const game = await get('SELECT id FROM games WHERE slug = ?', ['cardfight-vanguard']);
  const created = await tournaments.createTournament(
    { name, gameId: game.id, format: 'round_robin' },
    actorId
  );
  const tid = created.tournament.id;
  for (const u of users) await tournaments.registerPlayer(tid, u.id);
  const started = await engine.startTournament(tid, actorId);
  assert.equal(started.ok, true, started.error);
  return tid;
}

// Approve every remaining match: `winnerUserId` wins all of them.
async function finishRoundRobin(tid, winnerUserId, adminId) {
  const bundle = await tournaments.getTournamentBundle(tid);
  const winnerPlayer = bundle.players.find((p) => p.user_id === winnerUserId);
  const matches = bundle.matches.filter((m) => m.status === 'pending' && !Number(m.is_bye));

  for (const m of matches) {
    const p1IsWinner = Number(m.player1_id) === Number(winnerPlayer.id);
    const score1 = p1IsWinner ? 2 : 0;
    const score2 = p1IsWinner ? 0 : 2;
    const reporter = bundle.players.find((p) => p.id === m.player1_id).user_id;
    await engine.reportMatch(m.id, reporter, { score1, score2 });
    await engine.approveMatch(m.id, adminId, { score1, score2 });
  }
}

test('audit trail records who started, reported, approved and completed a tournament', async () => {
  const admin = await makeUser('admin');
  const players = await makePlayers(4);
  const tid = await createRR('Audit RR', players, admin.id);

  await finishRoundRobin(tid, players[0].id, admin.id);

  const events = await listEvents(tid);
  const actions = new Set(events.map((e) => e.action));

  assert.ok(actions.has('started'), 'records the start');
  assert.ok(actions.has('reported'), 'records score reports');
  assert.ok(actions.has('approved'), 'records approvals');
  assert.ok(actions.has('completed'), 'records completion');

  const start = events.find((e) => e.action === 'started');
  assert.equal(start.actor, admin.name, 'stores the actor name');
  assert.equal(start.actorId, admin.id);

  const approved = events.find((e) => e.action === 'approved');
  assert.equal(approved.actor, admin.name);
  assert.ok(approved.matchId, 'approval is linked to its match');
  assert.ok(/\d-\d/.test(approved.summary), 'summary carries the score');

  const report = events.find((e) => e.action === 'reported');
  assert.equal(report.actorId, report.actorId, 'report keeps its reporter');

  const done = events.find((e) => e.action === 'completed');
  assert.ok(done.summary.length > 0);

  assert.ok((await countEvents(tid)) >= events.length, 'count matches listed events');
});

test('seed order can be set before start and is locked afterwards', async () => {
  const admin = await makeUser('admin');
  const players = await makePlayers(4);
  const game = await get('SELECT id FROM games WHERE slug = ?', ['cardfight-vanguard']);
  const created = await tournaments.createTournament(
    { name: 'Seeded', gameId: game.id, format: 'single_elim' },
    admin.id
  );
  const tid = created.tournament.id;
  for (const u of players) await tournaments.registerPlayer(tid, u.id);

  const roster = await tournaments.listPlayers(tid);
  const reversed = roster.map((p) => Number(p.id)).reverse();

  const explicit = await tournaments.setSeeds(tid, { playerIds: reversed, actorId: admin.id });
  assert.equal(explicit.ok, true);
  const afterExplicit = await tournaments.listPlayers(tid);
  assert.deepEqual(
    afterExplicit.map((p) => Number(p.id)),
    reversed
  );
  assert.deepEqual(
    afterExplicit.map((p) => p.seed),
    [1, 2, 3, 4]
  );

  const random = await tournaments.setSeeds(tid, { mode: 'random', actorId: admin.id });
  assert.equal(random.ok, true);
  const afterRandom = await tournaments.listPlayers(tid);
  assert.deepEqual(
    [...afterRandom.map((p) => p.seed)].sort((a, b) => a - b),
    [1, 2, 3, 4]
  );

  await engine.startTournament(tid, admin.id);
  const locked = await tournaments.setSeeds(tid, { mode: 'random', actorId: admin.id });
  assert.equal(locked.ok, false);
  assert.equal(locked.status, 400);

  const seedEvents = await listEvents(tid);
  assert.ok(seedEvents.some((e) => e.action === 'seeds_set'));
});

test('profile aggregates placements, record, match feed and deck', async () => {
  const admin = await makeUser('admin');
  const players = await makePlayers(4);
  const winner = players[0];
  const tid = await createRR('Profile RR', players, admin.id);
  await finishRoundRobin(tid, winner.id, admin.id);

  const p = await profile.getPlayerProfile(winner.id);
  assert.ok(p, 'profile resolves');
  assert.equal(p.user.id, winner.id);

  assert.equal(p.totals.tournaments, 1);
  assert.equal(p.totals.completed, 1, 'sees the tournament as completed');
  assert.equal(p.totals.firstPlaces, 1, 'won it');
  assert.equal(p.totals.podiums, 1);
  assert.equal(p.totals.wins, 3, 'won every match');
  assert.equal(p.totals.losses, 0);
  assert.equal(p.totals.draws, 0);
  assert.equal(p.totals.matches, 3);

  assert.equal(p.history.length, 1);
  const h = p.history[0];
  assert.equal(h.rank, 1);
  assert.equal(h.record.wins, 3);
  assert.equal(h.status, 'completed');

  assert.equal(p.matchTotal, 3);
  assert.equal(p.matches.length, 3);
  for (const m of p.matches) {
    assert.equal(m.result, 'win');
    assert.ok(m.opponent, 'opponent name resolved');
    assert.ok(m.tournamentName);
  }

  const opponent = await profile.getPlayerProfile(players[1].id);
  assert.equal(opponent.totals.losses + opponent.totals.wins + opponent.totals.draws, 3);
  assert.ok(opponent.totals.wins + opponent.totals.losses + opponent.totals.draws > 0);

  // Unknown user resolves to null rather than throwing.
  assert.equal(await profile.getPlayerProfile(999999), null);
});

test('decklist saves to the account and is clamped to safe sizes', async () => {
  const user = await makeUser('player');
  await profile.updateDeck(user.id, {
    deckName: '  Dragon Empire Blademaster  ',
    deckList: `4x Dragonic Overlord\n${'x'.repeat(10000)}`,
  });

  const fresh = await getUser(user.id);
  assert.equal(fresh.deckName, 'Dragon Empire Blademaster');
  assert.equal(fresh.deckList.length, 6000, 'decklist is clamped');

  const p = await profile.getPlayerProfile(user.id);
  assert.equal(p.user.deckName, 'Dragon Empire Blademaster');

  await profile.updateDeck(user.id, { deckName: null, deckList: null });
  const cleared = await getUser(user.id);
  assert.equal(cleared.deckName, null);
  assert.equal(cleared.deckList, null);
});
