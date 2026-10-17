import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_URL = `file:${path.join(os.tmpdir(), `tcg-qr-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`)}`;
process.env.JWT_SECRET = 'test-secret';

const { initDb, get, run } = await import('../src/db.js');
await initDb();
const { ensureAdmin } = await import('../src/bootstrap.js');
await ensureAdmin();
const tournaments = await import('../src/services/tournaments.js');
const users = await import('../src/services/users.js');

let seq = 0;
async function makeUser(role = 'player') {
  seq += 1;
  return users.createUser({ username: `q${seq}_${Date.now()}`, password: 'secret123', name: `QR User ${seq}`, role });
}

test('every new account gets a unique fighter QR token', async () => {
  const a = await makeUser();
  const b = await makeUser();
  assert.ok(a.qrToken && a.qrToken.length >= 10);
  assert.ok(b.qrToken && b.qrToken.length >= 10);
  assert.notEqual(a.qrToken, b.qrToken);
  const looked = await users.getUserByQrToken(a.qrToken);
  assert.equal(looked.id, a.id);
  assert.equal(await users.getUserByQrToken('does-not-exist'), null);
});

test('fighters can customize their card theme and title', async () => {
  const u = await makeUser();
  assert.equal(u.cardTheme, 'kagero');

  const ok = await users.updateCard(u.id, { theme: 'narukami', title: 'Thunder Emperor' });
  assert.equal(ok.ok, true);
  assert.equal(ok.user.cardTheme, 'narukami');
  assert.equal(ok.user.cardTitle, 'Thunder Emperor');

  const bad = await users.updateCard(u.id, { theme: 'not-a-clan' });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
});

test('scanning a fighter card registers that player to a tournament', async () => {
  const admin = await makeUser('admin');
  const player = await makeUser();
  const created = await tournaments.createTournament(
    { name: 'QR Registration', gameId: 1, format: 'swiss' },
    admin.id
  );
  const tid = created.tournament.id;

  const result = await tournaments.registerByQr(tid, player.qrToken, { deck: 'Kagero — Dragonic Overlord' });
  assert.equal(result.ok, true);
  assert.equal(result.alreadyIn, false);
  assert.equal(result.player.user_id, player.id);
  assert.equal(result.player.deck, 'Kagero — Dragonic Overlord');

  const second = await tournaments.registerByQr(tid, player.qrToken);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyIn, true);

  const bundle = await tournaments.getTournamentBundle(tid);
  assert.equal(bundle.players.length, 1);
  assert.equal(bundle.players[0].user_id, player.id);
});

test('scanning an unknown card is rejected', async () => {
  const admin = await makeUser('admin');
  const created = await tournaments.createTournament({ name: 'Bad QR', gameId: 1 }, admin.id);
  const result = await tournaments.registerByQr(created.tournament.id, 'no-such-token');
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test('ensureUserQrTokens backfills legacy accounts missing a token', async () => {
  const u = await makeUser();
  await run('UPDATE users SET qr_token = NULL WHERE id = ?', [u.id]);
  const issued = await users.ensureUserQrTokens();
  assert.ok(issued >= 1);
  const row = await get('SELECT qr_token FROM users WHERE id = ?', [u.id]);
  assert.ok(row.qr_token && row.qr_token.length >= 10);
});
