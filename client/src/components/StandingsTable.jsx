import { Link } from 'react-router-dom';

export default function StandingsTable({ standings, showDeck = true, linkProfiles = false }) {
  if (!standings || standings.length === 0) {
    return <p className="muted">No standings yet.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="table standings">
        <thead>
          <tr>
            <th className="rank-col">#</th>
            <th>Player</th>
            <th className="num">Pts</th>
            <th className="num">W-L-D</th>
            <th className="num" title="Opponent match-win percentage">
              OMW%
            </th>
            <th className="num" title="Game-win percentage">
              GW%
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.id} className={s.dropped ? 'row-dropped' : ''}>
              <td className="rank-col">{s.rank}</td>
              <td>
                {linkProfiles && s.userId ? (
                  <Link className="player-name player-link" to={`/players/${s.userId}`}>
                    {s.name}
                  </Link>
                ) : (
                  <span className="player-name">{s.name}</span>
                )}
                {showDeck && s.deck && <span className="deck-tag">{s.deck}</span>}
                {s.dropped && <span className="tag tag-muted">dropped</span>}
                {s.eliminated && <span className="tag tag-muted">eliminated</span>}
              </td>
              <td className="num strong">{s.points}</td>
              <td className="num">
                {s.matchWins}-{s.matchLosses}-{s.draws}
                {s.byes > 0 && <span className="bye-tag" title={`${s.byes} bye(s)`}>*</span>}
              </td>
              <td className="num">{s.opponents.length ? `${(s.omw * 100).toFixed(1)}%` : '—'}</td>
              <td className="num">{(s.gameWinPct * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Tiebreakers: match points, then opponent match-win % (OMW%), then game-win %. * = received a bye.
      </p>
    </div>
  );
}
