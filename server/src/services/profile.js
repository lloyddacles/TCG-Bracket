import { get, all, run } from '../db.js';
import { listPlayers } from './tournaments.js';
import { computeStandings } from './standings.js';
import { computeAchievements } from './achievements.js';

const MAX_DECK_NAME = 80;
const MAX_DECK_LIST = 6000;
const MAX_FEATURED = 80;
const MAX_NATION = 60;
const MAX_PLAYSTYLE = 600;
const MAX_DECK_ART = 2_600_000;
const MAX_AVATAR = 900_000;

function cleanImage(value, maxLength, label) {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  const text = String(value).trim();
  if (!text) return { ok: true, value: null };
  if (text.length > maxLength) {
    return { ok: false, error: `${label} is too large. Try a smaller image.` };
  }
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(text)) {
    return { ok: true, value: text };
  }
  if (/^https?:\/\/\S+$/i.test(text) && text.length <= 2000) {
    return { ok: true, value: text };
  }
  return { ok: false, error: `${label} must be an uploaded image or an http(s) image URL` };
}

// Cross-tournament player profile: aggregate record, per-tournament placement
// and a recent match feed. Standings are recomputed per event so placements
// always reflect current data.
export async function getPlayerProfile(userId, { matchLimit = 30 } = {}) {
  const user = await get('SELECT * FROM users WHERE id = ?', [Number(userId)]);
  if (!user) return null;

  const entries = await all(
    `SELECT tp.id AS player_id, tp.seed, tp.deck, tp.dropped, tp.eliminated,
            t.id AS tournament_id, t.name AS tournament_name, t.format, t.status,
            t.best_of, t.points_win, t.points_draw, t.points_loss, t.created_at,
            t.completed_at, g.name AS game_name, g.slug AS game_slug
     FROM tournament_players tp
     JOIN tournaments t ON t.id = tp.tournament_id
     JOIN games g ON g.id = t.game_id
     WHERE tp.user_id = ?
     ORDER BY t.created_at DESC, t.id DESC`,
    [Number(userId)]
  );

  const totals = {
    tournaments: 0,
    completed: 0,
    firstPlaces: 0,
    podiums: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    byes: 0,
    gameWins: 0,
    gameLosses: 0,
    matches: 0,
  };
  const history = [];
  const recent = [];

  for (const e of entries) {
    const players = await listPlayers(e.tournament_id);
    const matches = await all(
      'SELECT * FROM matches WHERE tournament_id = ? ORDER BY bracket, round, match_index',
      [e.tournament_id]
    );
    const standings = computeStandings({
      players,
      matches,
      points: { win: e.points_win, draw: e.points_draw, loss: e.points_loss },
    });
    const mine = standings.find((s) => Number(s.id) === Number(e.player_id)) || null;
    const byId = new Map(players.map((p) => [Number(p.id), p]));

    const rec = { wins: 0, losses: 0, draws: 0, byes: 0, gameWins: 0, gameLosses: 0 };

    for (const m of matches) {
      const isP1 = Number(m.player1_id) === Number(e.player_id);
      const isP2 = Number(m.player2_id) === Number(e.player_id);
      if (!isP1 && !isP2) continue;

      if (Number(m.is_bye)) {
        if (m.status === 'approved') rec.byes += 1;
        continue;
      }
      if (m.status !== 'approved') continue;

      const myScore = isP1 ? Number(m.score1) || 0 : Number(m.score2) || 0;
      const oppScore = isP1 ? Number(m.score2) || 0 : Number(m.score1) || 0;
      rec.gameWins += myScore;
      rec.gameLosses += oppScore;
      if (m.is_draw || m.winner_id == null) rec.draws += 1;
      else if (Number(m.winner_id) === Number(e.player_id)) rec.wins += 1;
      else rec.losses += 1;

      const oppId = isP1 ? m.player2_id : m.player1_id;
      const opp = oppId != null ? byId.get(Number(oppId)) : null;
      recent.push({
        matchId: m.id,
        tournamentId: e.tournament_id,
        tournamentName: e.tournament_name,
        game: e.game_name,
        format: e.format,
        round: m.round,
        bracket: m.bracket,
        label: m.label || null,
        isBye: false,
        opponent: opp ? opp.display_name || opp.user_name || `Player ${oppId}` : null,
        opponentId: oppId != null ? Number(oppId) : null,
        myScore,
        oppScore,
        result: m.is_draw || m.winner_id == null ? 'draw' : Number(m.winner_id) === Number(e.player_id) ? 'win' : 'loss',
        at: m.approved_at || m.reported_at || m.created_at,
      });
    }

    totals.tournaments += 1;
    totals.wins += rec.wins;
    totals.losses += rec.losses;
    totals.draws += rec.draws;
    totals.byes += rec.byes;
    totals.gameWins += rec.gameWins;
    totals.gameLosses += rec.gameLosses;

    if (e.status === 'completed') {
      totals.completed += 1;
      if (mine?.rank === 1) totals.firstPlaces += 1;
      if (mine?.rank && mine.rank <= 3) totals.podiums += 1;
    }

    history.push({
      tournamentId: e.tournament_id,
      name: e.tournament_name,
      game: e.game_name,
      gameSlug: e.game_slug,
      format: e.format,
      status: e.status,
      seed: e.seed ?? null,
      deck: e.deck || null,
      dropped: !!Number(e.dropped),
      rank: mine?.rank ?? null,
      playerCount: standings.length,
      points: mine?.points ?? 0,
      record: rec,
      startedAt: e.created_at,
      completedAt: e.completed_at,
    });
  }

  totals.matches = totals.wins + totals.losses + totals.draws;
  recent.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')) || b.matchId - a.matchId);

  const shapedUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    cardTheme: user.card_theme || 'keter-sanctuary',
    cardTitle: user.card_title || null,
    avatar: user.avatar || null,
    deckName: user.deck_name || null,
    deckList: user.deck_list || null,
    deckArt: user.deck_art || null,
    deckFeatured: user.deck_featured || null,
    deckNation: user.deck_nation || null,
    deckPlaystyle: user.deck_playstyle || null,
    createdAt: user.created_at,
  };

  const profile = {
    user: shapedUser,
    totals,
    history,
    matches: recent.slice(0, matchLimit),
    matchTotal: recent.length,
  };
  profile.achievements = computeAchievements(profile);
  return profile;
}

function cleanText(value, maxLength) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

export async function updateDeck(
  userId,
  { deckName, deckList, deckFeatured, deckNation, deckPlaystyle, deckArt, avatar } = {}
) {
  const art = cleanImage(deckArt, MAX_DECK_ART, 'Deck artwork');
  if (!art.ok) return { ok: false, status: 400, error: art.error };
  const pic = cleanImage(avatar, MAX_AVATAR, 'Profile image');
  if (!pic.ok) return { ok: false, status: 400, error: pic.error };

  const fields = [];
  const args = [];
  const text = (column, value, max) => {
    const clean = cleanText(value, max);
    if (clean === undefined) return;
    fields.push(`${column} = ?`);
    args.push(clean);
  };

  text('deck_name', deckName, MAX_DECK_NAME);
  text('deck_list', deckList, MAX_DECK_LIST);
  text('deck_featured', deckFeatured, MAX_FEATURED);
  text('deck_nation', deckNation, MAX_NATION);
  text('deck_playstyle', deckPlaystyle, MAX_PLAYSTYLE);
  if (art.value !== undefined) {
    fields.push('deck_art = ?');
    args.push(art.value);
  }
  if (pic.value !== undefined) {
    fields.push('avatar = ?');
    args.push(pic.value);
  }

  if (!fields.length) return { ok: true };
  args.push(Number(userId));
  await run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, args);
  return { ok: true };
}
