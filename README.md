# TCG Bracket

A tournament bracket web app for trading card games. Start with **Cardfight Vanguard**
(plus other preloaded games), and run:

- **Swiss** — score-based pairing with rematch avoidance, byes, and OMW% / GW% tiebreakers
- **Single Elimination** — bracket with byes for non-power-of-two fields
- **Double Elimination** — winners and losers brackets with a grand-final reset
- **Round Robin** — circle-method schedule so everyone plays everyone

Players register, submit their own match results, and the organizer approves them.
Each tournament also has a shareable, read-only public bracket link.

Every player also gets a **personal QR "Fighter ID" card** with 15 nation & collab themes. The
organizer opens the **Scan desk**, scans the card, and the player is checked into a
tournament instantly — no typing. Players can save or print their card.

## Stack

- **Client** — React 18 + Vite + React Router (+ `qrcode.react`, `html5-qrcode`, `html2canvas`)
- **Server** — Node/Express (ESM) + SQLite via `@libsql/client`, JWT auth
- **Tests** — `node --test` (pairing engines + full-tournament integration + QR check-in + bulk ops + audit/profile + deck review, disputes and achievements)

The interface uses a dark esports theme: interactive brackets with deck artwork, a match
detail arena with victory/defeat states, champion showcase and podium, achievements, and an
optional sound/animation toggle (sound is off by default). Animations respect
`prefers-reduced-motion` and can be switched off from the top bar.

## Getting started

```bash
npm run install:all   # install root, server and client dependencies
npm run seed          # create demo players + tournaments (optional)
npm run dev           # start server (:4100) and client (:5273)
```

Open http://localhost:5273.

Default organizer login: `admin` / `admin123`
Demo player logins: `player1` … `player12` / `player123`

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and the web client together |
| `npm run build` | Build the client for production |
| `npm start` | Start the API server |
| `npm run seed` | Seed demo data |
| `npm test` | Run the server test suite |

## How a tournament runs

1. Organizer creates a tournament (game, format, best-of, time rule, draw handling, points).
2. Players register (or the organizer adds them by username) and can set their deck.
3. Organizer seeds the field on the **Seeding** tab, then starts the tournament — round 1
   pairings/bracket are generated.
4. Players report scores; the organizer approves them.
5. The app advances winners, drops losers into the losers bracket, and generates the
   next Swiss round automatically once every match in the current round is approved.
6. Share the public link so players and spectators can follow live.

## QR check-in

Each account has a short `qr_token`. The **My Card** page renders it as a themed
fighter card (nation or collab frame, code, emblem, title, fighter serial) and can export a PNG or print.

- **Organizer** — open **Scan desk**, pick a tournament, start the camera and scan a
  card. The player is registered (with their deck) and a scan feed records the result.
  A manual token box works when there is no camera.
- **Player** — can use the Scan desk to check *themselves* in; the API rejects checking
  in someone else's card (`403`). Re-scanning is idempotent ("Already checked in").

The QR payload is `TCGBRACKET:<qr_token>`. API: `PUT /api/auth/card`,
`POST /api/tournaments/:id/scan`.

Card themes are grouped into **Nations** — Keter Sanctuary (KS), Dragon Empire (DE),
Stoicheia (ST), Brandt Gate (BG), Dark States (DS), Lyrical Monasterio (LM) — and
**Collabs** — Buddyfight (BF), Quintessential Quintuplets (QQ), Frieren Journey Ends (FJE),
Shaman King (SK), Touken Ranbu (TR), BanG Dream! (BD), Corocoro (CC), Persona (P),
Record of Ragnarok (ROR).

## Live updates

Tournament pages and the dashboard stay in sync automatically: whenever anything changes
(a player checks in, a score is approved, a bracket advances, a tournament is created or
deleted), the server pushes a Server-Sent Events message and the client refetches. There is
a small **Live** indicator with the last-synced time, and if streaming is unavailable the
client silently falls back to polling.

API: `GET /api/tournaments/events` (all tournaments, for the dashboard) and
`GET /api/tournaments/:id/events` (a single event). Both are auth-guarded SSE streams, so the
client reads them with `fetch` rather than `EventSource`.

## Seeding & brackets

The **Seeding** tab lets an organizer order the field before the tournament starts:

- drag-free **move up/down** reordering with a single "Save seed order" action
- **Shuffle** for a random draw, **By registration** to reset to sign-up order
- seeds are locked once the tournament starts; they drive elimination bracket placement and
  act as the final Swiss tiebreaker

API: `POST /api/tournaments/:id/seeds` with either `{ playerIds: [..] }` or `{ mode: "random" | "registration" }`.

## Match history & audit log

Every meaningful action is stored in an append-only `match_events` table (with a denormalized
actor name so history survives account deletion) and shown newest-first in the **History**
tab. Actions include started, reported, approved, reset, bye, round advanced, grand-final
reset, seeds set, registration, check-in and roster edits.

API: `GET /api/tournaments/:id/history`. Organizer identities are only included for admins;
players see the same feed without the actor.

## Player profiles, deck artwork & approvals

Each player has a profile with aggregate stats (tournaments, match record, games, win rate,
1st-place and podium finishes), full tournament history with placement, a recent match feed,
and earned **achievements**. Players can save a **deck profile** from their own page:

- deck name and decklist
- **featured Vanguard unit** and **nation / collab**
- a short playstyle description
- **deck artwork** and **profile image** — uploaded files are resized in the browser and
  stored as data URLs (http(s) image URLs are also accepted)

Artwork appears in the bracket, match detail panel, champion showcase and leaderboard.
Missing or broken artwork always falls back to the player's card theme — never a random image.

Per-event deck registration is separate from the saved profile. Registering copies the saved
deck name; players can submit/update their event deck from the **Players** tab, and organizers
approve or reject it (with an optional note). Any deck edit resets the entry to **pending**.

API: `GET /api/profile`, `GET /api/profile/:id`, `PUT /api/profile/deck`,
`POST /api/tournaments/:id/players/:playerId/deck-submit` (player) and
`POST /api/tournaments/:id/players/:playerId/deck` (organizer review).

### Disputes

A participant can dispute a **reported** (not yet approved) result while the tournament is
active. Organizers see the reason in the match detail panel and can approve a corrected
result or clear it. Approving or clearing a dispute removes the dispute fields.

API: `POST /api/matches/:id/dispute`.

## Leaderboard & achievements

The **Leaderboard** aggregates approved results across active and completed events, ranked by
titles, then match win rate, then total wins. Achievements are derived from recorded match
data only:

- **First Victory**, **On a Roll** (3+ win streak), **Undefeated Run**
- **Comeback Player**, **Tournament Champion**, **Podium Finish**
- **Veteran** (5 events), **Sharp Shooter** (60%+ game win rate over 10+ games)

API: `GET /api/profile/leaderboard`.

## Interactive bracket

Elimination brackets show status (upcoming, awaiting approval, completed, disputed, bye),
current-round highlighting, deck art thumbnails, the champion strip, and an advance
animation when a result is confirmed. Click any match for the full arena: both deck
profiles, scores, match history, and organizer/participant actions. On small screens the
bracket switches to a round picker.

## Bulk tools

Every list can be edited in bulk, so an organizer never has to work one row at a time.

- **Multi-select + actions** — select rows to remove/drop/reinstate players, promote or
  disable accounts, and duplicate/archive/delete tournaments.
- **Spreadsheet result entry** — the Rounds tab's **Bulk entry** mode is a grid of score
  inputs; save them all at once and winners advance. **Approve all** clears every reported
  match in one click.
- **CSV import/export** — import tournaments, players, and match results from CSV (or paste)
  with a downloadable template and row-level error report. Export any list back to CSV.

API: `POST /api/users/bulk`, `POST /api/tournaments/bulk`,
`POST /api/tournaments/:id/players/bulk`, `POST /api/tournaments/:id/matches/bulk`.
Each returns `{ summary: { created, updated, removed, skipped, errors } }`.

## Configuration

Copy `server/.env.example` to `server/.env` to override defaults. For production set a
strong `JWT_SECRET` and optionally point `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` at a
hosted libSQL database.

## Project layout

```
server/
  src/
    pairing/        swiss, single/double elim, round robin (pure functions)
    services/       users, tournaments, standings, engine (results + advancement), bulk,
                    events (SSE hub), log (audit trail), profile
    routes/         auth, users, games, tournaments, matches, public, profile
  test/             pairing + engine integration + qr + bulk + profile/audit tests
client/
  src/
    pages/          dashboard, create, detail, public, print, users, card studio, scan desk, profile
    components/     layout, bracket, standings, modals, fighter QR card, bulk UI
    bulk.js         CSV parse/serialize/download helpers
    live.js         fetch-based SSE hook (fallback polling)
    card-themes.js  nation & collab frame themes for the QR fighter cards
```
