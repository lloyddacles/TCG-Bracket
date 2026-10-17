import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import { FORMAT_LABELS, TIME_RULE_LABELS } from '../format.js';

export default function PrintView() {
  const { id } = useParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [round, setRound] = useState(null);

  useEffect(() => {
    api
      .getTournament(id)
      .then((data) => {
        setBundle(data);
        setRound(data.tournament.current_round || 1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner full />;
  if (!bundle) return <div className="page"><div className="alert alert-error">{error || 'Not found'}</div></div>;

  const { tournament: t, players, matches, standings } = bundle;
  const playersMap = new Map(players.map((p) => [p.id, p]));
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const roundMatches = matches.filter((m) => m.round === round);
  const name = (id2, byFlag) => (byFlag ? 'BYE' : id2 == null ? '—' : playersMap.get(id2)?.name || `#${id2}`);

  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <Link to={`/tournaments/${id}`} className="btn btn-ghost">
          ← Back
        </Link>
        <label className="field inline">
          <span>Round</span>
          <select value={round} onChange={(e) => setRound(Number(e.target.value))}>
            {rounds.map((r) => (
              <option key={r} value={r}>
                Round {r}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <header className="print-head">
        <h1>{t.name}</h1>
        <div className="print-meta">
          <span>{FORMAT_LABELS[t.format]}</span>
          <span>Best of {t.best_of}</span>
          <span>Time rule: {TIME_RULE_LABELS[t.time_rule] || t.time_rule}</span>
          <span>Round {round} of {t.total_rounds || '?'}</span>
        </div>
      </header>

      <section className="print-section">
        <h2>Round {round} table slips</h2>
        <div className="slips">
          {roundMatches.map((m, i) => (
            <div key={m.id} className="slip">
              <div className="slip-table">Table {i + 1}</div>
              <div className="slip-line">
                <span className="slip-seat">1</span>
                <span className="slip-name">{name(m.player1_id, m.player1_is_bye)}</span>
              </div>
              <div className="slip-line">
                <span className="slip-seat">2</span>
                <span className="slip-name">{name(m.player2_id, m.player2_is_bye)}</span>
              </div>
              <div className="slip-result">Best of {t.best_of} · Result: ________</div>
            </div>
          ))}
        </div>
      </section>

      <section className="print-section">
        <h2>Standings</h2>
        <table className="table print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Deck</th>
              <th className="num">Pts</th>
              <th className="num">W-L-D</th>
              <th className="num">OMW%</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.id}>
                <td>{s.rank}</td>
                <td>{s.name}</td>
                <td>{s.deck || ''}</td>
                <td className="num">{s.points}</td>
                <td className="num">
                  {s.matchWins}-{s.matchLosses}-{s.draws}
                </td>
                <td className="num">{s.opponents.length ? `${(s.omw * 100).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
