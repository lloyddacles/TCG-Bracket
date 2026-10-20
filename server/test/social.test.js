import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_URL = `file:${path.join(
  os.tmpdir(),
  `tcg-social-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`
)}`;
process.env.JWT_SECRET = 'test-secret';

const { initDb, get } = await import('../src/db.js');
await initDb();
const { ensureAdmin } = await import('../src/bootstrap.js');
await ensureAdmin();
const tournaments = await import('../src/services/tournaments.js');
const engine = await import('../src/services/engine.js');
const profile = await import('../src/services/profile.js');
const { listEvents } = await import('../src/services/log.js');
const { getLeaderboard } = await import('../src/services/achievements.js');
const { createUser } = await import('../src/services/users.js');

let seq = 0;
async function makeUser(role = 'player') {
  seq += 1;
  return createUser({
    username: `so${seq}_${Date.now()}`,
    password: 'secret123',
    name: `Social User ${seq}`,
    role,
  });
}

async function setupTournament(users, adminId) {
  const game = await get('SELECT id FROM games WHERE slug = ?', ['cardfight-vanguard']);
  const created = await tournaments.createTournament(
    { name: `Social ${seq}`, gameId: game.id, format: 'round_robin' },
    adminId
  );
  const tid = created.tournament.id;
  for (const u of users) await tournaments.registerPlayer(tid, u.id);
  const started = await engine.startTournament(tid, adminId);
  assert.equal(started.ok, true, started.error);
  return tid;
}

test('deck profile stores artwork, featured unit, nation and playstyle', async () => {
  const user = await makeUser();
  const art = 'data:image/png;base64,AAAA';
  const saved = await profile.updateDeck(user.id, {
    deckName: 'Overlord Rush',
    deckFeatured: 'Dragonic Overlord',
    deckNation: 'Dragon Empire',
    deckPlaystyle: 'Aggressive restanding vanguard.',
    deckArt: art,
    avatar: 'https://example.com/avatar.png',
  });
  assert.equal(saved.ok, true);

  const data = await profile.getPlayerProfile(user.id);
  assert.equal(data.user.deckName, 'Overlord Rush');
  assert.equal(data.user.deckFeatured, 'Dragonic Overlord');
  assert.equal(data.user.deckNation, 'Dragon Empire');
  assert.equal(data.user.deckPlaystyle, 'Aggressive restanding vanguard.');
  assert.equal(data.user.deckArt, art);
  assert.equal(data.user.avatar, 'https://example.com/avatar.png');
});

test('deck artwork rejects unsafe or invalid images', async () => {
  const user = await makeUser();
  const bad = await profile.updateDeck(user.id, { deckArt: 'javascript:alert(1)' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /uploaded image or an http/i);

  const notImage = await profile.updateDeck(user.id, { avatar: 'data:text/plain;base64,AAAA' });
  assert.equal(notImage.ok, false);
});

test('registering seeds the event deck and organizers can review it', async () => {
  const admin = await makeUser('admin');
  const player = await makeUser();
  await profile.updateDeck(player.id, { deckName: 'Keter Sanctuary Control' });

  const game = await get('SELECT id FROM games WHERE slug = ?', ['cardfight-vanguard']);
  const created = await tournaments.createTournament(
    { name: 'Deck review', gameId: game.id, format: 'round_robin' },
    admin.id
  );
  const tid = created.tournament.id;
  await tournaments.registerPlayer(tid, player.id);

  let roster = await tournaments.listPlayers(tid);
  let entry = roster.find((p) => p.user_id === player.id);
  assert.equal(entry.deck, 'Keter Sanctuary Control');
  assert.equal(entry.deck_status, 'pending');

  const submitted = await tournaments.submitDeckForPlayer(tid, entry.id, player.id, {
    deck: 'Keter Sanctuary — Bastion',
  });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.player.deck_status, 'pending');
  assert.ok(submitted.player.deck_submitted_at, 'records a submission time');

  const outsider = await tournaments.submitDeckForPlayer(tid, entry.id, admin.id, { deck: 'Nope' });
  assert.equal(outsider.ok, false);
  assert.equal(outsider.status, 403);

  const approved = await tournaments.setDeckStatus(tid, entry.id, { status: 'approved' });
  assert.equal(approved.ok, true);
  roster = await tournaments.listPlayers(tid);
  entry = roster.find((p) => p.user_id === player.id);
  assert.equal(entry.deck_status, 'approved');

  const rejected = await tournaments.setDeckStatus(tid, entry.id, {
    status: 'rejected',
    note: 'Decklist is incomplete',
  });
  assert.equal(rejected.ok, true);
  roster = await tournaments.listPlayers(tid);
  entry = roster.find((p) => p.user_id === player.id);
  assert.equal(entry.deck_status, 'rejected');
  assert.equal(entry.deck_note, 'Decklist is incomplete');

  const invalid = await tournaments.setDeckStatus(tid, entry.id, { status: 'maybe' });
  assert.equal(invalid.ok, false);
});

test('participants can dispute a reported result and approving clears it', async () => {
  const admin = await makeUser('admin');
  const players = [await makeUser(), await makeUser()];
  const outsider = await makeUser();
  const tid = await setupTournament(players, admin.id);

  let bundle = await tournaments.getTournamentBundle(tid);
  const match = bundle.matches.find((m) => !Number(m.is_bye) && m.status === 'pending');
  assert.ok(match, 'a playable match exists');

  const reporter = bundle.players.find((p) => p.id === match.player1_id).user_id;
  const reported = await engine.reportMatch(match.id, reporter, { score1: 2, score2: 0 });
  assert.equal(reported.ok, true);

  const notParticipant = await engine.disputeMatch(match.id, outsider.id, { reason: 'Nope' });
  assert.equal(notParticipant.ok, false);
  assert.equal(notParticipant.status, 403);

  const disputed = await engine.disputeMatch(match.id, reporter, {
    reason: 'Score was entered backwards',
  });
  assert.equal(disputed.ok, true);

  bundle = await tournaments.getTournamentBundle(tid);
  const afterDispute = bundle.matches.find((m) => m.id === match.id);
  assert.equal(afterDispute.status, 'disputed');
  assert.equal(afterDispute.dispute_reason, 'Score was entered backwards');

  const events = await listEvents(tid);
  assert.ok(events.some((e) => e.action === 'disputed'), 'logs the dispute');

  const approved = await engine.approveMatch(match.id, admin.id);
  assert.equal(approved.ok, true);

  bundle = await tournaments.getTournamentBundle(tid);
  const afterApprove = bundle.matches.find((m) => m.id === match.id);
  assert.equal(afterApprove.dispute_reason, null);
  assert.equal(afterApprove.disputed_by, null);
});

test('leaderboard aggregates titles and returns earned achievements with artwork', async () => {
  const admin = await makeUser('admin');
  const [winner, loser] = [await makeUser(), await makeUser()];
  await profile.updateDeck(winner.id, {
    deckArt: 'data:image/png;base64,BBBB',
    deckFeatured: 'Dragonic Overlord',
    deckName: 'Overlord',
  });

  const tid = await setupTournament([winner, loser], admin.id);
  let bundle = await tournaments.getTournamentBundle(tid);
  const match = bundle.matches.find((m) => !Number(m.is_bye));
  const winnerPlayer = bundle.players.find((p) => p.user_id === winner.id);
  const p1IsWinner = Number(match.player1_id) === Number(winnerPlayer.id);

  await engine.reportMatch(match.id, winner.id, {
    score1: p1IsWinner ? 2 : 0,
    score2: p1IsWinner ? 0 : 2,
  });
  await engine.approveMatch(match.id, admin.id);

  const rows = await getLeaderboard();
  const row = rows.find((r) => r.userId === winner.id);
  assert.ok(row, 'winner appears on the leaderboard');
  assert.equal(row.firstPlaces, 1);
  assert.equal(row.rank, 1);
  assert.equal(row.deckArt, 'data:image/png;base64,BBBB');
  assert.ok(row.achievements.some((a) => a.id === 'tournament_champion'));

  const winnerProfile = await profile.getPlayerProfile(winner.id);
  const earned = winnerProfile.achievements.map((a) => a.id);
  assert.ok(earned.includes('first_victory'));
  assert.ok(earned.includes('tournament_champion'));
});
