import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './db.js';
import { ensureAdmin } from './bootstrap.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import gameRoutes from './routes/games.js';
import tournamentRoutes from './routes/tournaments.js';
import matchRoutes from './routes/matches.js';
import publicRoutes from './routes/public.js';

const allowedOrigins = (config.clientOrigin || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json({ limit: '2mb' }));

let ready = null;
function bootstrap() {
  if (!ready) ready = initDb().then(() => ensureAdmin());
  return ready;
}
app.use((req, res, next) => {
  bootstrap().then(() => next()).catch(next);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/public', publicRoutes);

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const message =
    status === 413
      ? 'That request was too large.'
      : status >= 500
        ? 'Something went wrong on the server'
        : err.message || 'Request failed';
  res.status(status).json({ error: message });
});

export default app;
