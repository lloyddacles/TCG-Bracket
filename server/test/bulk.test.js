import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_URL = `file:${path.join(os.tmpdir(), `tcg-bulk-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)}`;
process.env.JWT_SECRET = 'test-secret';

const { initDb, get } = await import('../src/db.js');
await initDb();
const { ensureAdmin } = await import('../src/bootstrap.js');
await ensureAdmin();
const tournaments = await import('../src/services/tournaments.js');
const bulk = await import('../src/services/bulk.js');
const engine = await import('../src/services/engine.js');
const { createUser } = await import('../src/services/users.js');

let seq = 0;
async function makeUser(role = 'player') {
  seq += 1;
  return createUser({ username: `b${seq}_${Date.now()}`, password: 'secret123', name: `Bulk User ${seq}`, role });
}

test('bulkUsers creates, updates, deactivates and deletes in one call', async () => {
  const admin = await makeUser('admin');
  const unameA = `bulk_a_${Date.now()}`;
  const unameB = `bulk_b_${Date.now()}`;

  const res = await bulk.bulkUsers(
    {
      create: [
        { username: unameA, name: 'Alpha' },
        { username: unameB, name: 'Bravo', role: 'admin', password: 'longpass1' },
        { username: unameA, name: 'Duplicate' },
      ],
    },
    admin.id
  );
  assert.equal(res.summary.created, 2);
  assert.ok(res.summary.errors.some((e) => /already exists/.test(e.message)));
  const alpha = res.issued.find((u) => u.username === unameA);
  assert.ok(alpha.generated && alpha.password.length >= 8);
  const bravo = res.issued.find((u) => u.username === unameB);
  assert.equal(bravo.generated, false);

  const alphaRow = await get('SELECT * FROM users WHERE username = ?', [unameA]);
  const upd = await bulk.bulkUsers(
    { update: [{ id: alphaRow.id, name: 'Alpha Renamed' }], deactivate: [bravo.id] },
    admin.id
  );
  assert.equal(upd.summary.updated, 2);
  const renamed = await get('SELECT name FROM users WHERE id = ?', [alphaRow.id]);
  assert.equal(renamed.name, 'Alpha Renamed');

  const del = await bulk.bulkUsers({ remove: [alphaRow.id, admin.id] }, admin.id);
  assert.equal(del.summary.removed, 1);
  assert.ok(del.summary.errors.some((e) => /own account/.test(e.message)));
});

test('bulkTournamentPlayers adds, updates and removes a roster', async () => {
  const admin = await makeUser('admin');
  const p1 = await makeUser();
  const p2 = await makeUser();
  const created = await tournaments.createTournament({ name: 'Bulk roster', gameId: 1 }, admin.id);
  const tid = created.tournament.id;

  const added = await bulk.bulkTournamentPlayers(tid, {
    add: [
      { username: p1.username, deck: 'Kagero', seed: 1 },
      { username: p2.username, deck: 'Royal Paladin' },
    ],
  });
  assert.equal(added.summary.added, 2);
  assert.equal(added.bundle.players.length, 2);
  const p1Player = added.bundle.players.find((p) => p.user_id === p1.id);
  assert.equal(p1Player.deck, 'Kagero');

  const upd = await bulk.bulkTournamentPlayers(tid, {
    update: [{ id: p2PlayerId(added, p2), deck: 'Aqua Force' }],
  });
  assert.equal(upd.summary.updated, 1);

  const rem = await bulk.bulkTournamentPlayers(tid, { remove: [p1Player.id] });
  assert.equal(rem.summary.removed, 1);
  assert.equal(rem.bundle.players.length, 1);
});

function p2PlayerId(result, user) {
  return result.bundle.players.find((p) => p.user_id === user.id).id;
}

test('bulkTournaments creates, duplicates and deletes', async () => {
  const admin = await makeUser('admin');
  const created = await bulk.bulkTournaments(
    { create: [{ name: 'Bulk One', gameId: 1 }, { name: 'Bulk Two', gameId: 1 }] },
    admin.id
  );
  assert.equal(created.summary.created, 2);

  const list = await tournaments.listTournaments({});
  const one = list.find((t) => t.name === 'Bulk One');
  const dup = await bulk.bulkTournaments({ duplicate: [one.id] }, admin.id);
  assert.equal(dup.summary.duplicated, 1);
  const copy = (await tournaments.listTournaments({})).find((t) => t.name === 'Bulk One (copy)');
  assert.ok(copy);

  const del = await bulk.bulkTournaments({ remove: [copy.id] }, admin.id);
  assert.equal(del.summary.removed, 1);
});

test('bulkMatches records results and advances rounds', async () => {
  const admin = await makeUser('admin');
  const created = await tournaments.createTournament({ name: 'Bulk matches', gameId: 1, format: 'swiss' }, admin.id);
  const tid = created.tournament.id;
  const players = [];
  for (let i = 0; i < 4; i += 1) {
    const u = await makeUser();
    await tournaments.registerPlayer(tid, u.id);
    players.push(u);
  }
  await engine.startTournament(tid);

  let bundle = await tournaments.getTournamentBundle(tid);
  const round1 = bundle.matches.filter((m) => m.status === 'pending' && m.player1_id && m.player2_id);
  const res = await bulk.bulkMatches(
    tid,
    { results: round1.map((m) => ({ id: m.id, winnerId: m.player1_id })) },
    admin.id
  );
  assert.equal(res.summary.recorded, round1.length);
  assert.equal(res.summary.errors.length, 0);

  bundle = await tournaments.getTournamentBundle(tid);
  assert.ok(bundle.matches.some((m) => m.round === 2), 'round 2 should be generated');

  // Report a round-2 match as a participant, then approve everything at once.
  const r2 = bundle.matches.find((m) => m.round === 2 && m.status === 'pending' && m.player1_id && m.player2_id);
  const participant = bundle.players.find((p) => p.id === r2.player1_id);
  await engine.reportMatch(r2.id, participant.user_id, { score1: 2, score2: 0 });

  const approve = await bulk.bulkMatches(tid, { approveAll: true }, admin.id);
  assert.ok(approve.summary.approved >= 1);
});
