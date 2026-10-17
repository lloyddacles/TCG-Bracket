import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import Bracket from '../components/Bracket.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import { FORMAT_LABELS, STATUS_LABELS, statusClass } from '../format.js';

const POLL_MS = 15000;

export default function PublicTournament() {
  const { slug } = useParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = async (initial = false) => {
      try {
        const data = await api.publicTournament(slug);
        if (!alive) return;
        setBundle(data);
        setUpdatedAt(new Date());
        setError('');
      } catch (err) {
        if (alive && initial) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load(true);
    timer.current = window.setInterval(() => load(false), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer.current);
    };
  }, [slug]);

  if (loading) return <Spinner full />;
  if (error || !bundle) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Tournament not found</h1>
          <p className="muted">{error || 'This bracket is unavailable or private.'}</p>
          <Link className="btn btn-ghost" to="/login">
            Go to TCG Bracket
          </Link>
        </div>
      </div>
    );
  }

  const { tournament: t, game, players, matches, standings, champion } = bundle;
  const isElim = t.format === 'single_elim' || t.format === 'double_elim';
  const playersMap = new Map(players.map((p) => [p.id, p]));
  const currentRoundMatches = matches.filter((m) => m.round === t.current_round && m.status !== 'void');

  return (
    <div className="public-shell">
      <header className="public-head">
        <div className="brand">
          <span className="brand-mark">⚔</span>
          <span className="brand-text">TCG Bracket</span>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/login">
          Organizer sign in
        </Link>
      </header>

      <div className="public-body">
        <div className="detail-title">
          <h1>{t.name}</h1>
          <div className="detail-badges">
            <span className={statusClass(t.status)}>{STATUS_LABELS[t.status] || t.status}</span>
            <span className="chip">{game?.name}</span>
            <span className="chip">{FORMAT_LABELS[t.format]}</span>
            <span className="chip">Best of {t.best_of}</span>
          </div>
          {updatedAt && <p className="muted small">Live · updated {updatedAt.toLocaleTimeString()}</p>}
        </div>

        {champion && (
          <div className="champion-banner large">
            <span>🏆</span>
            <div>
              <strong>Champion</strong>
              <div>{champion.name}</div>
            </div>
          </div>
        )}

        {isElim ? (
          <div className="card">
            <h3>Bracket</h3>
            <Bracket matches={matches} players={players} format={t.format} />
          </div>
        ) : (
          <>
            {t.status === 'active' && currentRoundMatches.length > 0 && (
              <div className="card">
                <h3>Round {t.current_round} pairings</h3>
                <div className="match-list">
                  {currentRoundMatches.map((m) => (
                    <ReadonlyMatch key={m.id} match={m} playersMap={playersMap} />
                  ))}
                </div>
              </div>
            )}
            <div className="card">
              <h3>Standings</h3>
              <StandingsTable standings={standings} />
            </div>
          </>
        )}

        <div className="card">
          <h3>Players ({players.filter((p) => !p.is_bye).length})</h3>
          <div className="pill-list">
            {players
              .filter((p) => !p.is_bye)
              .map((p) => (
                <span key={p.id} className={`pill ${p.dropped ? 'dropped' : ''}`}>
                  {p.seed ? `${p.seed}. ` : ''}
                  {p.name}
                  {p.deck ? <em> · {p.deck}</em> : null}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadonlyMatch({ match, playersMap }) {
  const name = (id, byFlag) => (byFlag ? 'BYE' : id == null ? 'TBD' : playersMap.get(id)?.name || `#${id}`);
  const win1 = match.winner_id && Number(match.winner_id) === Number(match.player1_id);
  const win2 = match.winner_id && Number(match.winner_id) === Number(match.player2_id);
  return (
    <div className={`match-row ${match.status}`}>
      <div className="match-players">
        <div className={`match-player ${win1 ? 'winner' : ''}`}>
          <span>{name(match.player1_id, match.player1_is_bye)}</span>
          <span className="match-score">{match.score1 ?? '—'}</span>
        </div>
        <div className={`match-player ${win2 ? 'winner' : ''}`}>
          <span>{name(match.player2_id, match.player2_is_bye)}</span>
          <span className="match-score">{match.score2 ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
