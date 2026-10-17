// Bracket helpers shared by single and double elimination.

export function nextPow2(n) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

// Standard bracket seed order. For size 8 -> [1,8,4,5,2,7,3,6] so that the top
// seeds are distributed across the bracket and only meet late.
export function seedOrder(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const m = seeds.length * 2 + 1;
    const next = [];
    for (const s of seeds) {
      next.push(s);
      next.push(m - s);
    }
    seeds = next;
  }
  return seeds;
}

export function slotPlayers(seedIds, size) {
  return seedOrder(size).map((seed) => (seed <= seedIds.length ? seedIds[seed - 1] : 'BYE'));
}
