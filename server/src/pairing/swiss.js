// Swiss pairing engine.
//
// Pure functions: given a list of players (with their current standing data)
// and the round number, produce the next round's pairings. Designed after the
// MTG / Swiss-manager style: sort by score, pair top-down preferring opponents
// on the same score, avoid rematches, and give the bye to the lowest-ranked
// player who has not yet received one.

function comparePlayers(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if ((b.omw ?? 0) !== (a.omw ?? 0)) return (b.omw ?? 0) - (a.omw ?? 0);
  if ((b.gameWinPct ?? 0) !== (a.gameWinPct ?? 0)) return (b.gameWinPct ?? 0) - (a.gameWinPct ?? 0);
  if (a.seed !== b.seed) return (a.seed ?? 0) - (b.seed ?? 0);
  return String(a.name).localeCompare(String(b.name));
}

function pickBye(pool) {
  // Fewest byes first (so everyone gets one before anyone gets two), then the
  // lowest-ranked (fewest points), then the highest seed number.
  const sorted = [...pool].sort((a, b) => {
    if ((a.byes ?? 0) !== (b.byes ?? 0)) return (a.byes ?? 0) - (b.byes ?? 0);
    if (a.points !== b.points) return a.points - b.points;
    return (b.seed ?? 0) - (a.seed ?? 0);
  });
  return sorted[0];
}

function isRematch(played, a, b) {
  return !!played.get(a.id)?.has(b.id);
}

function candidateCost(a, b, played, allowRematch) {
  const rematch = isRematch(played, a, b) ? 1000 : 0;
  if (rematch && !allowRematch) return Infinity;
  return rematch + Math.abs(a.points - b.points);
}

function solve(list, played, allowRematch) {
  if (list.length === 0) return [];
  const a = list[0];
  const rest = list.slice(1);
  const candidates = [...rest].sort(
    (b, c) => candidateCost(a, b, played, allowRematch) - candidateCost(a, c, played, allowRematch)
  );
  for (const b of candidates) {
    if (isRematch(played, a, b) && !allowRematch) continue;
    const remaining = rest.filter((x) => x !== b);
    const res = solve(remaining, played, allowRematch);
    if (res) return [[a, b], ...res];
  }
  return null;
}

/**
 * @param {Array} players - active players with { id, name, points, omw, gameWinPct,
 *   seed, byes, opponents: number[], dropped, eliminated }
 * @returns {{ pairings: Array<{player1_id:number, player2_id:number}>, bye: number|null }}
 */
export function pairSwiss(players) {
  const active = players.filter((p) => !p.dropped && !p.eliminated);
  const sorted = [...active].sort(comparePlayers);

  let bye = null;
  let pool = sorted;
  if (pool.length % 2 === 1) {
    bye = pickBye(pool);
    pool = pool.filter((p) => p !== bye);
  }

  const played = new Map();
  for (const p of pool) played.set(p.id, new Set(p.opponents || []));

  const result = solve(pool, played, false) || solve(pool, played, true) || [];
  const pairings = result.map(([a, b]) => ({ player1_id: a.id, player2_id: b.id }));
  return { pairings, bye: bye ? bye.id : null };
}
