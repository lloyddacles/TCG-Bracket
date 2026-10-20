import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import DeckArt, { PlayerAvatar } from '../components/DeckArt.jsx';

function pct(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .getLeaderboard()
      .then((data) => {
        if (alive) setRows(data.leaderboard || data.rows || []);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const top = rows.slice(0, 3);
  const order = [1, 0, 2].map((i) => top[i]).filter(Boolean);

  return (
    <div className="page leaderboard-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Hall of fame</span>
          <h1>Leaderboard</h1>
          <p className="muted">Ranked by titles, then match win rate, then total wins across all events.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <Spinner full />}

      {!loading && !error && rows.length === 0 && (
        <div className="empty-state">
          <span aria-hidden="true">🏆</span>
          <p className="muted">No completed results yet. Play some matches to claim the first title.</p>
        </div>
      )}

      {!loading && order.length > 0 && (
        <div className="leader-podium">
          {order.map((r) => (
            <Link key={r.userId} to={`/players/${r.userId}`} className={`leader-podium-card place-${r.rank}`}>
              <span className="leader-podium-rank">{r.rank === 1 ? '1st' : r.rank === 2 ? '2nd' : '3rd'}</span>
              <PlayerAvatar user={{ name: r.name, avatar: r.avatar }} size="lg" />
              <strong>{r.name}</strong>
              <span className="muted small">
                {r.firstPlaces} title{r.firstPlaces === 1 ? '' : 's'} · {pct(r.winRate)} win rate
              </span>
              <DeckArt
                src={r.deckArt}
                themeKey={r.cardTheme}
                size="xs"
                featured={r.deckFeatured}
                className="leader-podium-art"
              />
            </Link>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="card leaderboard-card">
          <div className="table-wrap">
            <table className="table leaderboard-table">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th>Player</th>
                  <th>Events</th>
                  <th>Record</th>
                  <th>Win rate</th>
                  <th>Titles</th>
                  <th>Badges</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="rank-col">
                      <span className={`rank-badge rank-${r.rank <= 3 ? r.rank : 'rest'}`}>{r.rank}</span>
                    </td>
                    <td>
                      <Link to={`/players/${r.userId}`} className="leader-player">
                        <PlayerAvatar user={{ name: r.name, avatar: r.avatar }} size="sm" />
                        <span>
                          <strong>{r.name}</strong>
                          <em className="muted small">{r.deckName || r.deckFeatured || 'No profile deck'}</em>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {r.tournaments}
                      {r.completed ? <span className="muted small"> · {r.completed} done</span> : null}
                    </td>
                    <td>
                      {r.wins}-{r.losses}
                      {r.draws ? `-${r.draws}` : ''}
                    </td>
                    <td>{pct(r.winRate)}</td>
                    <td>
                      {r.firstPlaces > 0 ? (
                        <span className="title-count">🏆 {r.firstPlaces}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="badge-row">
                        {(r.achievements || []).map((a) => (
                          <span key={a.id} className={`badge badge-${a.tier}`} title={a.description}>
                            {a.icon} {a.name}
                          </span>
                        ))}
                        {(!r.achievements || r.achievements.length === 0) && (
                          <span className="muted small">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
