import { get, all } from '../db.js';
import { listPlayers } from './tournaments.js';
import { computeStandings } from './standings.js';

// Achievements are derived only from recorded, approved match data. Nothing
// here awards a badge for a button press or demo content.

export const ACHIEVEMENTS = {
  first_victory: {
    name: 'First Victory',
    description: 'Win your first recorded tournament match.',
    icon: '⚔',
    tier: 'bronze',
  },
  on_a_roll: {
    name: 'On a Roll',
    description: 'Win three approved matches in a row.',
    icon: '🔥',
    tier: 'silver',
  },
  undefeated_run: {
    name: 'Undefeated Run',
    description: 'Win a completed tournament without losing a match.',
    icon: '🛡',
    tier: 'gold',
  },
  comeback_player: {
    name: 'Comeback Player',
    description: 'Finish on the podium after losing a match in the same event.',
    icon: '↗',
    tier: 'silver',
  },
  tournament_champion: {
    name: 'Tournament Champion',
    description: 'Take first place in a completed tournament.',
    icon: '🏆',
    tier: 'gold',
  },
  podium_finish: {
    name: 'Podium Finish',
    description: 'Finish in the top three of a completed tournament.',
    icon: '🥇',
    tier: 'bronze',
  },
  veteran: {
    name: 'Veteran',
    description: 'Register for five tournaments.',
    icon: '🎖',
    tier: 'silver',
  },
  sharp_shooter: {
    name: 'Sharp Shooter',
    description: 'Hold a 60% or better game win rate over at least 10 games.',
    icon: '🎯',
    tier: 'silver',
  },
};

function longestWinStreak(matches) {
  const ordered = [...matches]
    .filter((m) => m.result === 'win' || m.result === 'loss' || m.result === 'draw')
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')) || a.matchId - b.matchId);
  let best = 0;
  let current = 0;
  for (const m of ordered) {
    if (m.result === 'win') {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function earnedAtFor(history, predicate) {
  const hits = history
    .filter((h) => h.status === 'completed' && predicate(h))
    .map((h) => h.completedAt || h.startedAt)
    .filter(Boolean)
    .sort();
  return hits.length ? hits[hits.length - 1] : null;
}

// `profile` is the object returned by getPlayerProfile.
export function computeAchievements(profile) {
  const { totals, history, matches } = profile;
  const games = totals.gameWins + totals.gameLosses;
  const gamePct = games ? totals.gameWins / games : 0;
  const streak = longestWinStreak(matches);

  const earned = [];

  if (totals.wins >= 1) {
    earned.push({
      ...ACHIEVEMENTS.first_victory,
      id: 'first_victory',
      earnedAt: earnedAtFor(history, (h) => h.record.wins >= 1),
    });
  }
  if (streak >= 3) {
    earned.push({
      ...ACHIEVEMENTS.on_a_roll,
      id: 'on_a_roll',
      earnedAt: earnedAtFor(history, (h) => h.record.wins >= 3),
      progress: `${streak} wins in a row`,
    });
  }
  if (history.some((h) => h.status === 'completed' && h.rank === 1 && h.record.losses === 0 && h.record.wins >= 2)) {
    earned.push({
      ...ACHIEVEMENTS.undefeated_run,
      id: 'undefeated_run',
      earnedAt: earnedAtFor(
        history,
        (h) => h.rank === 1 && h.record.losses === 0 && h.record.wins >= 2
      ),
    });
  }
  if (history.some((h) => h.status === 'completed' && h.rank <= 3 && h.record.losses >= 1)) {
    earned.push({
      ...ACHIEVEMENTS.comeback_player,
      id: 'comeback_player',
      earnedAt: earnedAtFor(history, (h) => h.rank <= 3 && h.record.losses >= 1),
    });
  }
  if (totals.firstPlaces >= 1) {
    earned.push({
      ...ACHIEVEMENTS.tournament_champion,
      id: 'tournament_champion',
      earnedAt: earnedAtFor(history, (h) => h.rank === 1),
      progress: totals.firstPlaces > 1 ? `${totals.firstPlaces} titles` : null,
    });
  }
  if (totals.podiums >= 1) {
    earned.push({
      ...ACHIEVEMENTS.podium_finish,
      id: 'podium_finish',
      earnedAt: earnedAtFor(history, (h) => h.rank <= 3),
      progress: `${totals.podiums} podium${totals.podiums === 1 ? '' : 's'}`,
    });
  }
  if (totals.tournaments >= 5) {
    earned.push({
      ...ACHIEVEMENTS.veteran,
      id: 'veteran',
      earnedAt: earnedAtFor(history, () => true),
      progress: `${totals.tournaments} events`,
    });
  }
  if (games >= 10 && gamePct >= 0.6) {
    earned.push({
      ...ACHIEVEMENTS.sharp_shooter,
      id: 'sharp_shooter',
      earnedAt: null,
      progress: `${Math.round(gamePct * 100)}% games`,
    });
  }

  return earned;
}

// Cross-event leaderboard. Standings are recomputed per tournament so ranks
// reflect the same rules used everywhere else in the app.
export async function getLeaderboard({ limit = 100 } = {}) {
  const tournaments = await all(
    "SELECT * FROM tournaments WHERE status IN ('active','completed') ORDER BY created_at ASC, id ASC"
  );

  const byUser = new Map();
  const ensure = (userId, name) => {
    const key = Number(userId);
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: key,
        name,
        tournaments: 0,
        completed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        byes: 0,
        gameWins: 0,
        gameLosses: 0,
        firstPlaces: 0,
        podiums: 0,
        bestRank: null,
        points: 0,
        titles: [],
      });
    }
    return byUser.get(key);
  };

  for (const t of tournaments) {
    const players = await listPlayers(t.id);
    const matches = await all('SELECT * FROM matches WHERE tournament_id = ?', [t.id]);
    const standings = computeStandings({
      players,
      matches,
      points: { win: t.points_win, draw: t.points_draw, loss: t.points_loss },
    });
    const playerById = new Map(players.map((p) => [Number(p.id), p]));

    for (const s of standings) {
      const raw = playerById.get(Number(s.id));
      if (!raw) continue;
      const entry = ensure(raw.user_id, raw.display_name || raw.user_name || s.name);

      entry.tournaments += 1;
      entry.wins += s.matchWins;
      entry.losses += s.matchLosses;
      entry.draws += s.draws;
      entry.byes += s.byes;
      entry.gameWins += s.gameWins;
      entry.gameLosses += s.gameLosses;
      entry.points += s.points;

      if (t.status === 'completed') {
        entry.completed += 1;
        if (s.rank === 1) {
          entry.firstPlaces += 1;
          entry.titles.push({ tournamentId: t.id, name: t.name, at: t.completed_at });
        }
        if (s.rank <= 3) entry.podiums += 1;
        // Provisional ranks from active events are not meaningful yet.
        if (entry.bestRank == null || s.rank < entry.bestRank) entry.bestRank = s.rank;
      }
    }
  }

  const rows = [...byUser.values()].map((e) => {
    const played = e.wins + e.losses + e.draws;
    const games = e.gameWins + e.gameLosses;
    return {
      ...e,
      matches: played,
      winRate: played ? (e.wins + e.draws * 0.5) / played : 0,
      gameWinRate: games ? e.gameWins / games : 0,
      titles: e.titles.slice(-5).reverse(),
    };
  });

  const activeRows = rows.filter((r) => r.wins + r.losses + r.draws > 0 || r.completed > 0);
  activeRows.sort(
    (a, b) =>
      b.firstPlaces - a.firstPlaces ||
      b.winRate - a.winRate ||
      b.wins - a.wins ||
      (a.bestRank ?? 999) - (b.bestRank ?? 999) ||
      a.name.localeCompare(b.name)
  );

  activeRows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const top = activeRows.slice(0, limit);
  if (top.length) {
    const users = await all(
      `SELECT id, avatar, deck_art, deck_featured, deck_nation, deck_name, card_theme
         FROM users WHERE id IN (${top.map(() => '?').join(',')})`,
      top.map((r) => r.userId)
    );
    const userById = new Map(users.map((u) => [Number(u.id), u]));
    for (const r of top) {
      const u = userById.get(Number(r.userId));
      if (!u) continue;
      r.avatar = u.avatar || null;
      r.deckArt = u.deck_art || null;
      r.deckFeatured = u.deck_featured || null;
      r.deckNation = u.deck_nation || null;
      r.deckName = u.deck_name || null;
      r.cardTheme = u.card_theme || null;
    }
  }

  return top.map((r) => ({
    ...r,
    achievements: computeLeaderboardBadges(r),
  }));
}

function computeLeaderboardBadges(r) {
  const ids = [];
  if (r.firstPlaces >= 1) ids.push('tournament_champion');
  if (r.podiums >= 1) ids.push('podium_finish');
  if (r.tournaments >= 5) ids.push('veteran');
  if (r.gameWins + r.gameLosses >= 10 && r.gameWinRate >= 0.6) ids.push('sharp_shooter');
  return ids.map((id) => ({ id, ...ACHIEVEMENTS[id] }));
}

export async function getChampionSummary(tournamentId) {
  const t = await get('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
  if (!t) return null;
  const players = await listPlayers(tournamentId);
  const matches = await all(
    'SELECT * FROM matches WHERE tournament_id = ? ORDER BY bracket, round, match_index',
    [tournamentId]
  );
  const standings = computeStandings({
    players,
    matches,
    points: { win: t.points_win, draw: t.points_draw, loss: t.points_loss },
  });
  return { tournament: t, players, matches, standings };
}
