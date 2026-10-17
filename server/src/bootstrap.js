import { get } from './db.js';
import { config } from './config.js';
import { createUser, flagUsersWithDefaultPassword, ensureUserQrTokens } from './services/users.js';

const DEFAULT_ADMIN = { username: 'admin', password: 'admin123', name: 'Tournament Organizer' };

const DEFAULT_GAMES = [
  {
    name: 'Cardfight Vanguard',
    slug: 'cardfight-vanguard',
    default_best_of: 3,
    default_time_rule: 'sudden_death',
    default_allow_draws: 0,
  },
  { name: 'Yu-Gi-Oh!', slug: 'yugioh', default_best_of: 3, default_time_rule: 'extra_turns', default_allow_draws: 1 },
  { name: 'Magic: The Gathering', slug: 'mtg', default_best_of: 3, default_time_rule: 'extra_turns', default_allow_draws: 1 },
  { name: 'Pokemon TCG', slug: 'pokemon', default_best_of: 3, default_time_rule: 'sudden_death', default_allow_draws: 0 },
  { name: 'One Piece Card Game', slug: 'one-piece', default_best_of: 3, default_time_rule: 'extra_turns', default_allow_draws: 1 },
  { name: 'Generic TCG', slug: 'generic', default_best_of: 3, default_time_rule: 'draw', default_allow_draws: 1 },
];

async function ensureGames() {
  const row = await get('SELECT COUNT(*) AS c FROM games');
  if (Number(row.c) > 0) return;
  for (const game of DEFAULT_GAMES) {
    await get(
      `INSERT INTO games (name, slug, default_best_of, default_time_rule, default_allow_draws)
       VALUES (?, ?, ?, ?, ?)`,
      [game.name, game.slug, game.default_best_of, game.default_time_rule, game.default_allow_draws]
    );
  }
}

export async function ensureAdmin() {
  const row = await get('SELECT COUNT(*) AS c FROM users');
  if (Number(row.c) === 0) {
    await createUser({
      ...DEFAULT_ADMIN,
      role: 'admin',
      mustChangePassword: config.forceDefaultPasswordChange ? 1 : 0,
    });
    console.log(`Seeded default admin -> username: ${DEFAULT_ADMIN.username}  password: ${DEFAULT_ADMIN.password}`);
  } else if (config.forceDefaultPasswordChange) {
    const flagged = await flagUsersWithDefaultPassword();
    if (flagged) console.log(`Flagged ${flagged} account(s) still using the default password`);
  }
  await ensureGames();
  const issued = await ensureUserQrTokens();
  if (issued) console.log(`Issued QR fighter tokens to ${issued} existing account(s)`);
}
