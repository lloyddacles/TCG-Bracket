// Standings computation from approved matches. Pure function so it can be
// unit-tested and reused by both the management and public views.

const MWP_FLOOR = 1 / 3;

function blankStat(p) {
  return {
    id: p.id,
    name: p.display_name || p.name || p.user_name || `Player ${p.id}`,
    deck: p.deck || null,
    seed: p.seed ?? null,
    dropped: !!Number(p.dropped),
    eliminated: !!Number(p.eliminated),
    matchWins: 0,
    matchLosses: 0,
    draws: 0,
    byes: 0,
    gameWins: 0,
    gameLosses: 0,
    opponents: [],
    points: 0,
    omw: 0,
    gameWinPct: 0,
    matchWinPct: 0,
  };
}

export function computeStandings({ players, matches, points = { win: 3, draw: 1, loss: 0 } }) {
  const stats = new Map();
  for (const p of players) {
    if (Number(p.is_bye)) continue;
    stats.set(p.id, blankStat(p));
  }

  const approved = matches.filter((m) => m.status === 'approved');
  for (const m of approved) {
    const p1 = m.player1_id != null ? stats.get(m.player1_id) : null;
    const p2 = m.player2_id != null ? stats.get(m.player2_id) : null;

    if (Number(m.is_bye)) {
      const p = p1 || p2;
      if (p) {
        p.byes += 1;
        p.matchWins += 1;
      }
      continue;
    }
    if (!p1 || !p2) continue;

    p1.opponents.push(p2.id);
    p2.opponents.push(p1.id);

    const s1 = Number(m.score1) || 0;
    const s2 = Number(m.score2) || 0;
    p1.gameWins += s1;
    p1.gameLosses += s2;
    p2.gameWins += s2;
    p2.gameLosses += s1;

    if (m.is_draw || m.winner_id == null) {
      p1.draws += 1;
      p2.draws += 1;
    } else if (Number(m.winner_id) === p1.id) {
      p1.matchWins += 1;
      p2.matchLosses += 1;
    } else if (Number(m.winner_id) === p2.id) {
      p2.matchWins += 1;
      p1.matchLosses += 1;
    }
  }

  for (const s of stats.values()) {
    s.points = s.matchWins * points.win + s.draws * points.draw + s.matchLosses * points.loss;
    const matchesPlayed = s.matchWins + s.matchLosses + s.draws;
    s.matchWinPct = matchesPlayed ? (s.matchWins + s.draws * 0.5) / matchesPlayed : 0;
    const games = s.gameWins + s.gameLosses;
    s.gameWinPct = games ? s.gameWins / games : 0;
  }

  for (const s of stats.values()) {
    const opps = s.opponents.map((id) => stats.get(id)).filter(Boolean);
    s.omw = opps.length
      ? opps.reduce((acc, o) => acc + Math.max(o.matchWinPct, MWP_FLOOR), 0) / opps.length
      : 0;
  }

  const ranking = [...stats.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.omw - a.omw ||
      b.gameWinPct - a.gameWinPct ||
      (a.seed ?? 0) - (b.seed ?? 0)
  );
  ranking.forEach((s, i) => {
    s.rank = i + 1;
  });
  return ranking;
}

// Build the input shape the Swiss engine expects ({ points, omw, ... opponents }).
export function toSwissPlayers({ players, matches, points }) {
  const standings = computeStandings({ players, matches, points });
  const rawById = new Map(players.map((p) => [p.id, p]));
  return standings.map((s) => {
    const raw = rawById.get(s.id) || {};
    return {
      id: s.id,
      name: s.name,
      points: s.points,
      omw: s.omw,
      gameWinPct: s.gameWinPct,
      seed: s.seed,
      byes: s.byes,
      dropped: s.dropped,
      eliminated: s.eliminated,
      opponents: matches
        .filter(
          (m) =>
            m.status === 'approved' &&
            !Number(m.is_bye) &&
            (m.player1_id === s.id || m.player2_id === s.id)
        )
        .map((m) => (m.player1_id === s.id ? m.player2_id : m.player1_id))
        .filter((id) => id != null),      
    };
  });
}
