# TCG Bracket

A tournament bracket web app for trading card games. Start with **Cardfight Vanguard**
(plus other preloaded games), and run:

- **Swiss** — score-based pairing with rematch avoidance, byes, and OMW% / GW% tiebreakers
- **Single Elimination** — bracket with byes for non-power-of-two fields
- **Double Elimination** — winners and losers brackets with a grand-final reset
- **Round Robin** — circle-method schedule so everyone plays everyone

Players register, submit their own match results, and the organizer approves them.
Each tournament also has a shareable, read-only public bracket link.

Every player also gets a **personal QR "Fighter ID" card** with 10 clan themes. The
organizer opens the **Scan desk**, scans the card, and the player is checked into a
tournament instantly — no typing. Players can save or print their card.

## Stack

- **Client** — React 18 + Vite + React Router (+ `qrcode.react`, `html5-qrcode`, `html2canvas`)
- **Server** — Node/Express (ESM) + SQLite via `@libsql/client`, JWT auth
- **Tests** — `node --test` (pairing engines + full-tournament integration + QR check-in + bulk ops)

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
3. Organizer starts the tournament — round 1 pairings/bracket are generated.
4. Players report scores; the organizer approves them.
5. The app advances winners, drops losers into the losers bracket, and generates the
   next Swiss round automatically once every match in the current round is approved.
6. Share the public link so players and spectators can follow live.

## QR check-in

Each account has a short `qr_token`. The **My Card** page renders it as a themed
fighter card (clan frame, emblem, title, fighter serial) and can export a PNG or print.

- **Organizer** — open **Scan desk**, pick a tournament, start the camera and scan a
  card. The player is registered (with their deck) and a scan feed records the result.
  A manual token box works when there is no camera.
- **Player** — can use the Scan desk to check *themselves* in; the API rejects checking
  in someone else's card (`403`). Re-scanning is idempotent ("Already checked in").

The QR payload is `TCGBRACKET:<qr_token>`. API: `PUT /api/auth/card`,
`POST /api/tournaments/:id/scan`.

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
    services/       users, tournaments, standings, engine (results + advancement), bulk
    routes/         auth, users, games, tournaments, matches, public
  test/             pairing + engine integration + qr + bulk tests
client/
  src/
    pages/          dashboard, create, detail, public, print, users, card studio, scan desk
    components/     layout, bracket, standings, modals, fighter QR card, bulk UI
    bulk.js         CSV parse/serialize/download helpers
    card-themes.js  clan frame themes for the QR fighter cards
```
