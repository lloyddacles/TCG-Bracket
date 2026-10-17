// Tiny in-process pub/sub for live UI updates (single-process server).
// Buckets are arbitrary strings, e.g. `tournament:12` or `tournaments`.

const subscribers = new Map();

const HEARTBEAT_MS = 25000;
let heartbeat = null;

function startHeartbeat() {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const res of allResponses()) {
      try {
        res.write(': ping\n\n');
      } catch {
        // ignore write failures; close handler cleans up
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();
}

function allResponses() {
  const out = [];
  for (const set of subscribers.values()) {
    for (const res of set) out.push(res);
  }
  return out;
}

export function subscriberCount(bucket = null) {
  if (bucket) return subscribers.get(bucket)?.size || 0;
  return allResponses().length;
}

export function subscribe(bucket, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  if (!subscribers.has(bucket)) subscribers.set(bucket, new Set());
  const set = subscribers.get(bucket);
  set.add(res);

  const remove = () => {
    const current = subscribers.get(bucket);
    if (current) {
      current.delete(res);
      if (current.size === 0) subscribers.delete(bucket);
    }
    if (subscriberCount() === 0 && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    try {
      res.end();
    } catch {
      // already closed
    }
  };

  req.on('close', remove);
  req.on('aborted', remove);
  startHeartbeat();
  return remove;
}

export function emit(bucket, event, data = {}) {
  const set = subscribers.get(bucket);
  if (!set || set.size === 0) return 0;
  const frame = `event: ${event}\ndata: ${JSON.stringify({ bucket, ...data })}\n\n`;
  let delivered = 0;
  for (const res of set) {
    try {
      res.write(frame);
      delivered += 1;
    } catch {
      set.delete(res);
    }
  }
  return delivered;
}

export const tournamentBucket = (id) => `tournament:${id}`;
export const TOURNAMENTS_BUCKET = 'tournaments';

export function emitTournamentChanged(tournamentId, reason = 'update') {
  emit(tournamentBucket(tournamentId), 'changed', { tournamentId: Number(tournamentId), reason });
  emit(TOURNAMENTS_BUCKET, 'changed', { tournamentId: Number(tournamentId), reason });
}
