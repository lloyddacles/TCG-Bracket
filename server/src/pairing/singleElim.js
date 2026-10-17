// Single elimination bracket generation.
//
// `seedIds` must be the list of tournament_player ids in seed order.
// Returns { size, rounds, matches } where each match is:
//   { key, round, bracket, index, label, player1_id, player2_id,
//     winner_to: {key, slot}|null, loser_to: null }
// `'BYE'` marks an empty slot; `null` marks a slot not yet determined.

import { nextPow2, slotPlayers } from './bracket-utils.js';

export function buildSingleElim(seedIds) {
  const n = seedIds.length;
  const size = nextPow2(n);
  const rounds = Math.log2(size);
  const slots = slotPlayers(seedIds, size);
  const matches = [];

  for (let r = 1; r <= rounds; r += 1) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i += 1) {
      const isFirst = r === 1;
      const key = `M${r}-${i}`;
      matches.push({
        key,
        round: r,
        bracket: 'main',
        index: i,
        label: r === rounds ? 'Final' : `W${r}-${i + 1}`,
        player1_id: isFirst ? slots[2 * i] : null,
        player2_id: isFirst ? slots[2 * i + 1] : null,
        winner_to: r < rounds ? { key: `M${r + 1}-${Math.floor(i / 2)}`, slot: (i % 2) + 1 } : null,
        loser_to: null,
      });
    }
  }

  return { size, rounds, matches };
}
