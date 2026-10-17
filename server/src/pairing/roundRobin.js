// Round-robin scheduling using the circle (polygon) method. With an odd number
// of players one player sits out each round (returned as a bye pairing).
//
// Returns an array of rounds; each round is an array of
// { player1_id, player2_id } where player2_id may be null (a bye).

export function buildRoundRobin(playerIds) {
  const ids = [...playerIds];
  const hasBye = ids.length % 2 === 1;
  const list = hasBye ? [...ids, null] : ids;
  const size = list.length;
  const rounds = [];
  const arr = [...list];

  for (let r = 0; r < size - 1; r += 1) {
    const round = [];
    for (let i = 0; i < size / 2; i += 1) {
      const a = arr[i];
      const b = arr[size - 1 - i];
      if (a === null && b === null) continue;
      round.push({ player1_id: a ?? b, player2_id: a === null || b === null ? null : b });
    }
    rounds.push(round);
    // Rotate all but the first player.
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr.splice(0, arr.length, fixed, ...rest);
  }

  return rounds;
}
