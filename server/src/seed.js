import { initDb, get, all } from './db.js';
import { ensureAdmin } from './bootstrap.js';
import { createUser, updateCard } from './services/users.js';
import { createTournament, registerPlayer, updatePlayer, listPlayers, getTournamentBySlug } from './services/tournaments.js';
import { startTournament, setMatchResult } from './services/engine.js';

const PLAYERS = [
  'Aichi Sendou',
  'Kai Toshiki',
  'Misaki Tokura',
  'Kamui Katsuragi',
  'Ren Suzugamori',
  'Leon Soryu',
  'Nova Grappler',
  'Mikoto Kiba',
  'Taishi Miwa',
  'Shingo Komoi',
  'Yuri Usui',
  'Rekka Tatsunagi',
];

// Card theme, title and deck for each demo fighter (aligned with PLAYERS order).
const DEMO_CARDS = [
  { theme: 'keter-sanctuary', title: 'Rising Star', deck: 'Keter Sanctuary — Blaster Blade' },
  { theme: 'dragon-empire', title: 'Blazing Emperor', deck: 'Dragon Empire — Dragonic Overlord' },
  { theme: 'keter-sanctuary', title: 'Foreseer of Fate', deck: 'Keter Sanctuary — Tsukuyomi' },
  { theme: 'dragon-empire', title: 'Storm Fist', deck: 'Dragon Empire — Thunder Break Dragon' },
  { theme: 'dark-states', title: 'Shadow Sovereign', deck: 'Dark States — Phantom Blaster Dragon' },
  { theme: 'stoicheia', title: 'Tidal Commander', deck: 'Stoicheia — Maelstrom Dragon' },
  { theme: 'brandt-gate', title: 'Steel Justice', deck: 'Brandt Gate — Ultimate Daiyusha' },
  { theme: 'lyrical-monasterio', title: 'Sunlit Legion', deck: 'Lyrical Monasterio — Spectral Duke' },
  { theme: 'stoicheia', title: 'Ghost Captain', deck: 'Stoicheia — Cocytus' },
  { theme: 'dark-states', title: 'Time Runner', deck: 'Dark States — Chronojet Dragon' },
  { theme: 'buddyfight', title: 'Celestial Strategist', deck: 'Buddyfight — Drum Bunker Dragon' },
  { theme: 'record-of-ragnarok', title: 'Crimson Tactician', deck: 'Record of Ragnarok — Adam' },
];

const DEMO_PASSWORD = 'player123';

async function ensurePlayers() {
  const created = {};
  for (let i = 0; i < PLAYERS.length; i += 1) {
    const name = PLAYERS[i];
    const username = `player${i + 1}`;
    const card = DEMO_CARDS[i] || {};
    const existing = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (existing) {
      created[username] = existing;
      if (card.theme) await updateCard(existing.id, { theme: card.theme, title: card.title });
      continue;
    }
    const user = await createUser({ username, password: DEMO_PASSWORD, name, role: 'player' });
    if (card.theme) await updateCard(user.id, { theme: card.theme, title: card.title });
    created[username] = user;
  }
  return created;
}

function pickNames(count) {
  return Array.from({ length: count }, (_, i) => `player${i + 1}`);
}

async function seedTournament({ name, format, gameId, players, bestOf = 3, allowDraws = 0, roundsOverride = null }) {
  const admin = await get("SELECT * FROM users WHERE username = 'admin'");
  const result = await createTournament(
    { name, gameId, format, bestOf, allowDraws, roundsOverride },
    admin.id
  );
  const t = result.tournament;
  for (const username of players) {
    const user = await get(`SELECT * FROM users WHERE username = ?`, [username]);
    const reg = await registerPlayer(t.id, user.id);
    const idx = PLAYERS.findIndex((_, i) => `player${i + 1}` === username);
    const card = DEMO_CARDS[idx];
    if (reg.ok && reg.player && card?.deck) {
      await updatePlayer(reg.player.id, { deck: card.deck });
    }
  }
  return getTournamentBySlug(t.public_slug);
}

async function playRound(tournamentId, round, adminId) {
  const matches = await all(
    "SELECT * FROM matches WHERE tournament_id = ? AND round = ? AND status = 'pending'",
    [tournamentId, round]
  );
  for (const m of matches) {
    if (m.player1_id == null || m.player2_id == null) continue;
    // Deterministic-ish: higher seed (lower player id) wins game 1, alternate.
    const winnerId = m.match_index % 2 === 0 ? m.player1_id : m.player2_id;
    await setMatchResult(m.id, adminId, { winnerId });
  }
}

async function main() {
  await initDb();
  await ensureAdmin();
  const users = await ensurePlayers();
  const admin = await get("SELECT * FROM users WHERE username = 'admin'");
  const games = await all('SELECT * FROM games');
  const vanguard = games.find((g) => g.slug === 'cardfight-vanguard');
  const pokemon = games.find((g) => g.slug === 'pokemon');

  const existing = await get("SELECT COUNT(*) AS c FROM tournaments WHERE name LIKE '[Demo]%'");
  if (Number(existing.c) > 0) {
    console.log('Demo tournaments already exist — skipping.');
    return;
  }

  const swiss = await seedTournament({
    name: '[Demo] Saturday Night Vanguard — Swiss',
    format: 'swiss',
    gameId: vanguard.id,
    players: pickNames(8),
  });
  await startTournament(swiss.id);
  await playRound(swiss.id, 1, admin.id);

  await seedTournament({
    name: '[Demo] Vanguard Store Championship — Single Elimination',
    format: 'single_elim',
    gameId: vanguard.id,
    players: pickNames(8),
  });

  await seedTournament({
    name: '[Demo] Pokemon League Cup — Double Elimination',
    format: 'double_elim',
    gameId: pokemon.id,
    players: pickNames(6),
  });

  await seedTournament({
    name: '[Demo] Round Robin Weekly',
    format: 'round_robin',
    gameId: vanguard.id,
    players: pickNames(5),
    allowDraws: 1,
  });

  const total = await get('SELECT COUNT(*) AS c FROM tournaments');
  console.log(`Seeded ${total.c} tournament(s) and ${PLAYERS.length} demo players.`);
  console.log(`Demo player logins: player1..player12 / ${DEMO_PASSWORD}`);
  console.log('Organizer login: admin / admin123');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
