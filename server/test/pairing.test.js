import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pairSwiss } from '../src/pairing/swiss.js';
import { buildRoundRobin } from '../src/pairing/roundRobin.js';
import { buildSingleElim } from '../src/pairing/singleElim.js';
import { buildDoubleElim } from '../src/pairing/doubleElim.js';
import { nextPow2, seedOrder } from '../src/pairing/bracket-utils.js';
import { computeStandings } from '../src/services/standings.js';

function players(n, overrides = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    points: 0,
    omw: 0,
    gameWinPct: 0,
    seed: i + 1,
    byes: 0,
    opponents: [],
    dropped: false,
    eliminated: false,
    ...(overrides[i + 1] || {}),
  }));
}

test('swiss pairs everyone with no odd player left over', () => {
  const { pairings, bye } = pairSwiss(players(8));
  assert.equal(pairings.length, 4);
  assert.equal(bye, null);
  const seen = new Set();
  for (const p of pairings) {
    seen.add(p.player1_id);
    seen.add(p.player2_id);
  }
  assert.equal(seen.size, 8);
});

test('swiss gives the bye to the lowest-ranked player without one', () => {
  const roster = players(7, {
    1: { points: 9 },
    2: { points: 9 },
    3: { points: 6 },
    4: { points: 6 },
    5: { points: 3 },
    6: { points: 3 },
    7: { points: 0 },
  });
  const { bye, pairings } = pairSwiss(roster);
  assert.equal(bye, 7);
  assert.equal(pairings.length, 3);
});

test('swiss avoids rematches when an alternative exists', () => {
  const roster = players(4, {
    1: { opponents: [2] },
    2: { opponents: [1] },
  });
  const { pairings } = pairSwiss(roster);
  const pairKeys = pairings.map((p) => [p.player1_id, p.player2_id].sort().join('-'));
  assert.ok(!pairKeys.includes('1-2'), `did not expect a 1v2 rematch, got ${pairKeys}`);
});

test('swiss prefers same-score opponents', () => {
  const roster = players(4, {
    1: { points: 6 },
    2: { points: 6 },
    3: { points: 0 },
    4: { points: 0 },
  });
  const { pairings } = pairSwiss(roster);
  const keys = pairings.map((p) => [p.player1_id, p.player2_id].sort().join('-'));
  assert.deepEqual(keys.sort(), ['1-2', '3-4']);
});

test('round robin has every pair meet exactly once', () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const rounds = buildRoundRobin(ids);
  assert.equal(rounds.length, 5);
  const played = new Set();
  for (const round of rounds) {
    for (const m of round) {
      const key = [m.player1_id, m.player2_id].sort((a, b) => a - b).join('-');
      assert.ok(!played.has(key), `duplicate pairing ${key}`);
      played.add(key);
    }
  }
  assert.equal(played.size, (6 * 5) / 2);
});

test('round robin handles an odd number of players with byes', () => {
  const rounds = buildRoundRobin([1, 2, 3, 4, 5]);
  assert.equal(rounds.length, 5);
  const byes = rounds.flat().filter((m) => m.player2_id == null);
  assert.equal(byes.length, 5); // one bye per round
});

test('seed order distributes top seeds', () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.equal(nextPow2(5), 8);
  assert.equal(nextPow2(16), 16);
});

test('single elimination builds a full bracket and links winners forward', () => {
  const { rounds, matches, size } = buildSingleElim([1, 2, 3, 4, 5]);
  assert.equal(size, 8);
  assert.equal(rounds, 3);
  // 4 + 2 + 1 matches
  assert.equal(matches.length, 7);
  const roundOne = matches.filter((m) => m.round === 1);
  assert.ok(roundOne.some((m) => m.player1_id === 'BYE' || m.player2_id === 'BYE'));
  const final = matches.find((m) => m.round === 3);
  assert.equal(final.winner_to, null);
  // Every non-final match points at a valid match.
  const keys = new Set(matches.map((m) => m.key));
  for (const m of matches) {
    if (m.winner_to) assert.ok(keys.has(m.winner_to.key), `missing target ${m.winner_to.key}`);
  }
});

test('double elimination has 2R-2 losers rounds and a reset final', () => {
  const { matches, rounds } = buildDoubleElim([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(rounds, 3);
  const lbRounds = new Set(matches.filter((m) => m.bracket === 'losers').map((m) => m.round));
  assert.equal(lbRounds.size, 2 * rounds - 2);
  assert.ok(matches.find((m) => m.key === 'GF1'));
  assert.ok(matches.find((m) => m.key === 'GF2'));
  const keys = new Set(matches.map((m) => m.key));
  for (const m of matches) {
    if (m.winner_to) assert.ok(keys.has(m.winner_to.key));
    if (m.loser_to) assert.ok(keys.has(m.loser_to.key));
  }
});

test('double elimination grand final is fed by the winners final and losers final', () => {
  const { matches } = buildDoubleElim([1, 2, 3, 4]);
  const gf1 = matches.find((m) => m.key === 'GF1');
  const feeders = matches.filter((m) => m.winner_to && m.winner_to.key === 'GF1');
  assert.equal(feeders.length, 2);
  assert.deepEqual(feeders.map((f) => f.winner_to.slot).sort(), [1, 2]);
  assert.equal(gf1.winner_to, null);
});

test('standings award points and compute opponent win percentage', () => {
  const roster = [
    { id: 1, name: 'A', seed: 1 },
    { id: 2, name: 'B', seed: 2 },
    { id: 3, name: 'C', seed: 3 },
    { id: 4, name: 'D', seed: 4 },
  ];
  const matches = [
    { player1_id: 1, player2_id: 2, score1: 2, score2: 0, winner_id: 1, status: 'approved', is_bye: 0 },
    { player1_id: 3, player2_id: 4, score1: 2, score2: 1, winner_id: 3, status: 'approved', is_bye: 0 },
  ];
  const standings = computeStandings({ players: roster, matches, points: { win: 3, draw: 1, loss: 0 } });
  assert.equal(standings[0].id, 1);
  assert.equal(standings[0].points, 3);
  assert.equal(standings[0].gameWins, 2);
  const a = standings.find((s) => s.id === 1);
  assert.ok(a.omw > 0);
});

test('standings resolve the display name from user_name rows (as listPlayers returns)', () => {
  const roster = [
    { id: 10, user_name: 'Aichi Sendou', display_name: null, seed: 1 },
    { id: 11, user_name: 'Kai Toshiki', display_name: 'The Emperor', seed: 2 },
  ];
  const standings = computeStandings({ players: roster, matches: [], points: { win: 3, draw: 1, loss: 0 } });
  const byId = Object.fromEntries(standings.map((s) => [s.id, s]));
  assert.equal(byId[10].name, 'Aichi Sendou');
  assert.equal(byId[11].name, 'The Emperor');
});
