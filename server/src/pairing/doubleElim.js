// Double elimination bracket generation.
//
// Structure (for bracket size S, R = log2(S) winners rounds):
//   - Winners bracket: R rounds, standard seeding.
//   - Losers bracket: 2R-2 rounds.
//       * LB round 1: pairs the losers of WB round 1.
//       * For each WB round k = 2..R:
//           - a "drop" round: LB survivors vs the losers of WB round k
//           - (if k < R) a "consolidation" round pairing the drop winners
//   - Grand final: WB champion vs LB champion. A second "reset" match is
//     included and only activates if the losers-bracket player wins the first.
//
// `'BYE'` marks an empty slot; `null` marks a slot not yet determined.

import { nextPow2, slotPlayers } from './bracket-utils.js';

export function buildDoubleElim(seedIds) {
  const n = seedIds.length;
  const size = nextPow2(n);
  const R = Math.log2(size);
  const slots = slotPlayers(seedIds, size);
  const matches = [];
  const add = (m) => {
    matches.push(m);
    return m;
  };

  // --- Winners bracket ---
  const wb = {};
  for (let r = 1; r <= R; r += 1) {
    const count = size / 2 ** r;
    wb[r] = [];
    for (let i = 0; i < count; i += 1) {
      const isFirst = r === 1;
      const m = add({
        key: `W${r}-${i}`,
        round: r,
        bracket: 'main',
        index: i,
        label: r === R ? 'Winners Final' : `W${r}-${i + 1}`,
        player1_id: isFirst ? slots[2 * i] : null,
        player2_id: isFirst ? slots[2 * i + 1] : null,
        winner_to: r < R ? { key: `W${r + 1}-${Math.floor(i / 2)}`, slot: (i % 2) + 1 } : null,
        loser_to: null,
      });
      wb[r][i] = m;
    }
  }

  // --- Losers bracket ---
  let lbRound = 0;
  let prev = null;

  // LB round 1: WB round 1 losers.
  lbRound += 1;
  const lb1Count = Math.max(1, size / 4);
  const lb1 = [];
  for (let i = 0; i < lb1Count; i += 1) {
    lb1.push(
      add({
        key: `L${lbRound}-${i}`,
        round: lbRound,
        bracket: 'losers',
        index: i,
        label: `L${lbRound}-${i + 1}`,
        player1_id: null,
        player2_id: null,
        winner_to: null,
        loser_to: null,
      })
    );
  }
  for (let i = 0; i < size / 2; i += 1) {
    wb[1][i].loser_to = { key: lb1[Math.floor(i / 2)].key, slot: (i % 2) + 1 };
  }
  prev = lb1;

  for (let k = 2; k <= R; k += 1) {
    // Drop round.
    lbRound += 1;
    const dropCount = size / 2 ** k;
    const drop = [];
    for (let i = 0; i < dropCount; i += 1) {
      drop.push(
        add({
          key: `L${lbRound}-${i}`,
          round: lbRound,
          bracket: 'losers',
          index: i,
          label: `L${lbRound}-${i + 1}`,
          player1_id: null,
          player2_id: null,
          winner_to: null,
          loser_to: null,
        })
      );
    }
    // LB survivors (in order) on the top half; WB round-k losers reversed on the
    // bottom half to reduce immediate rematches.
    for (let i = 0; i < dropCount; i += 1) {
      prev[i].winner_to = { key: drop[i].key, slot: 1 };
      wb[k][dropCount - 1 - i].loser_to = { key: drop[i].key, slot: 2 };
    }
    prev = drop;

    if (k < R) {
      // Consolidation round.
      lbRound += 1;
      const consCount = size / 2 ** (k + 1);
      const cons = [];
      for (let i = 0; i < consCount; i += 1) {
        cons.push(
          add({
            key: `L${lbRound}-${i}`,
            round: lbRound,
            bracket: 'losers',
            index: i,
            label: `L${lbRound}-${i + 1}`,
            player1_id: null,
            player2_id: null,
            winner_to: null,
            loser_to: null,
          })
        );
      }
      for (let i = 0; i < prev.length; i += 1) {
        prev[i].winner_to = { key: cons[Math.floor(i / 2)].key, slot: (i % 2) + 1 };
      }
      prev = cons;
    }
  }

  // --- Grand final ---
  const gf1 = add({
    key: 'GF1',
    round: R + 1,
    bracket: 'grand_final',
    index: 0,
    label: 'Grand Final',
    player1_id: null,
    player2_id: null,
    winner_to: null,
    loser_to: null,
  });
  const gf2 = add({
    key: 'GF2',
    round: R + 2,
    bracket: 'grand_final',
    index: 1,
    label: 'Grand Final (Reset)',
    player1_id: null,
    player2_id: null,
    winner_to: null,
    loser_to: null,
  });

  wb[R][0].winner_to = { key: gf1.key, slot: 1 };
  prev[0].winner_to = { key: gf1.key, slot: 2 };

  return { size, rounds: R, matches, grandFinalKeys: ['GF1', 'GF2'], resetKey: 'GF2' };
}
