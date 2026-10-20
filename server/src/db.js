import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const isLocalFile = config.dbUrl.startsWith('file:');

if (isLocalFile) {
  const filePath = config.dbUrl.slice('file:'.length);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

let clientPromise = null;

function createClientPromise() {
  if (isLocalFile) {
    return import('@libsql/client').then((m) =>
      m.createClient({ url: config.dbUrl, authToken: config.dbAuthToken })
    );
  }
  return import('@libsql/client/web').then((m) =>
    m.createClient({ url: config.dbUrl, authToken: config.dbAuthToken })
  );
}

function getClient() {
  if (!clientPromise) clientPromise = createClientPromise();
  return clientPromise;
}

export async function get(sql, args = []) {
  const client = await getClient();
  const rs = await client.execute({ sql, args });
  return rs.rows[0] ?? null;
}

export async function all(sql, args = []) {
  const client = await getClient();
  const rs = await client.execute({ sql, args });
  return rs.rows;
}

export async function run(sql, args = []) {
  const client = await getClient();
  const rs = await client.execute({ sql, args });
  return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid ?? 0) };
}

export async function batch(statements, mode = 'write') {
  const client = await getClient();
  return client.batch(statements, mode);
}

async function executeMultiple(sql) {
  const client = await getClient();
  return client.executeMultiple(sql);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    qr_token TEXT UNIQUE,
    card_theme TEXT NOT NULL DEFAULT 'keter-sanctuary',
    card_title TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    avatar TEXT,
    deck_name TEXT,
    deck_list TEXT,
    deck_art TEXT,
    deck_featured TEXT,
    deck_nation TEXT,
    deck_playstyle TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    default_best_of INTEGER NOT NULL DEFAULT 3,
    default_time_rule TEXT NOT NULL DEFAULT 'sudden_death',
    default_allow_draws INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    game_id INTEGER NOT NULL REFERENCES games(id),
    format TEXT NOT NULL DEFAULT 'swiss',
    status TEXT NOT NULL DEFAULT 'draft',
    best_of INTEGER NOT NULL DEFAULT 3,
    allow_draws INTEGER NOT NULL DEFAULT 0,
    time_rule TEXT NOT NULL DEFAULT 'sudden_death',
    points_win INTEGER NOT NULL DEFAULT 3,
    points_draw INTEGER NOT NULL DEFAULT 1,
    points_loss INTEGER NOT NULL DEFAULT 0,
    rounds_override INTEGER,
    max_players INTEGER,
    registration_open INTEGER NOT NULL DEFAULT 1,
    public_slug TEXT NOT NULL UNIQUE,
    view_public INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    current_round INTEGER NOT NULL DEFAULT 0,
    total_rounds INTEGER,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
  CREATE INDEX IF NOT EXISTS idx_tournaments_game ON tournaments(game_id);

  CREATE TABLE IF NOT EXISTS tournament_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    deck TEXT,
    seed INTEGER,
    losses INTEGER NOT NULL DEFAULT 0,
    dropped INTEGER NOT NULL DEFAULT 0,
    eliminated INTEGER NOT NULL DEFAULT 0,
    is_bye INTEGER NOT NULL DEFAULT 0,
    deck_status TEXT NOT NULL DEFAULT 'pending',
    deck_note TEXT,
    deck_submitted_at TEXT,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tournament_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_tplayers_tournament ON tournament_players(tournament_id);

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    bracket TEXT NOT NULL DEFAULT 'swiss',
    match_index INTEGER NOT NULL DEFAULT 0,
    slot_key TEXT,
    label TEXT,
    player1_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL,
    player2_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL,
    player1_is_bye INTEGER NOT NULL DEFAULT 0,
    player2_is_bye INTEGER NOT NULL DEFAULT 0,
    score1 INTEGER,
    score2 INTEGER,
    winner_id INTEGER REFERENCES tournament_players(id) ON DELETE SET NULL,
    is_draw INTEGER NOT NULL DEFAULT 0,
    is_bye INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reported_at TEXT,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TEXT,
    winner_to_match INTEGER,
    winner_to_slot INTEGER,
    loser_to_match INTEGER,
    loser_to_slot INTEGER,
    dispute_reason TEXT,
    disputed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    disputed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (tournament_id, bracket, round, match_index)
  );

  CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round);

  CREATE TABLE IF NOT EXISTS match_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    round INTEGER,
    action TEXT NOT NULL,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT,
    summary TEXT,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_match_events_tournament ON match_events(tournament_id, id);
  CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id);

  CREATE TABLE IF NOT EXISTS login_attempts (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    first_failed_at TEXT,
    locked_until TEXT,
    updated_at TEXT
  );
`;

async function ensureColumn(table, column, ddl) {
  const cols = await all(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await executeMultiple(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

let initPromise = null;

export function initDb() {
  if (!initPromise) initPromise = doInit();
  return initPromise;
}

async function doInit() {
  await executeMultiple('PRAGMA foreign_keys = ON;');
  await executeMultiple(SCHEMA);
  await ensureColumn('matches', 'slot_key', 'slot_key TEXT');
  await ensureColumn('matches', 'player1_is_bye', 'player1_is_bye INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('matches', 'player2_is_bye', 'player2_is_bye INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('tournaments', 'total_rounds', 'total_rounds INTEGER');
  await ensureColumn('tournament_players', 'is_bye', 'is_bye INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'qr_token', 'qr_token TEXT');
  await ensureColumn('users', 'card_theme', "card_theme TEXT NOT NULL DEFAULT 'keter-sanctuary'");
  await ensureColumn('users', 'card_title', 'card_title TEXT');
  await ensureColumn('users', 'deck_name', 'deck_name TEXT');
  await ensureColumn('users', 'deck_list', 'deck_list TEXT');
  await ensureColumn('users', 'avatar', 'avatar TEXT');
  await ensureColumn('users', 'deck_art', 'deck_art TEXT');
  await ensureColumn('users', 'deck_featured', 'deck_featured TEXT');
  await ensureColumn('users', 'deck_nation', 'deck_nation TEXT');
  await ensureColumn('users', 'deck_playstyle', 'deck_playstyle TEXT');
  await ensureColumn('tournament_players', 'deck_status', "deck_status TEXT NOT NULL DEFAULT 'pending'");
  await ensureColumn('tournament_players', 'deck_note', 'deck_note TEXT');
  await ensureColumn('tournament_players', 'deck_submitted_at', 'deck_submitted_at TEXT');
  await ensureColumn('matches', 'dispute_reason', 'dispute_reason TEXT');
  await ensureColumn('matches', 'disputed_by', 'disputed_by INTEGER');
  await ensureColumn('matches', 'disputed_at', 'disputed_at TEXT');

  await migrateClanThemes();
}

// The card themes moved from Vanguard clans to nations/collabs. Remap any
// legacy clan values so existing cards keep a sensible look. Idempotent.
const LEGACY_THEME_MAP = {
  kagero: 'dragon-empire',
  narukami: 'dragon-empire',
  'royal-paladin': 'keter-sanctuary',
  'gold-paladin': 'keter-sanctuary',
  'oracle-think-tank': 'keter-sanctuary',
  'shadow-paladin': 'dark-states',
  'gear-chronicle': 'dark-states',
  'dimension-police': 'brandt-gate',
  granblue: 'stoicheia',
  'aqua-force': 'stoicheia',
};

async function migrateClanThemes() {
  const keys = Object.keys(LEGACY_THEME_MAP);
  const placeholders = keys.map(() => '?').join(', ');
  const rows = await all(`SELECT id, card_theme FROM users WHERE card_theme IN (${placeholders})`, keys);
  for (const row of rows) {
    const next = LEGACY_THEME_MAP[row.card_theme];
    if (next) await run('UPDATE users SET card_theme = ? WHERE id = ?', [next, row.id]);
  }
}
