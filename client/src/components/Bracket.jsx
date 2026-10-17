import { FORMAT_LABELS } from '../format.js';

function nameFor(id, byes, players, byFlag) {
  if (byFlag) return 'BYE';
  if (id == null) return 'TBD';
  return players.get(id)?.name || `#${id}`;
}

function MatchCard({ match, players }) {
  const p1 = nameFor(match.player1_id, null, players, match.player1_is_bye);
  const p2 = nameFor(match.player2_id, null, players, match.player2_is_bye);
  const decided = match.status === 'approved';
  const win1 = decided && match.winner_id && Number(match.winner_id) === Number(match.player1_id);
  const win2 = decided && match.winner_id && Number(match.winner_id) === Number(match.player2_id);
  const showScore = match.score1 != null || match.score2 != null;

  return (
    <div className={`bracket-card ${match.status}`} title={`${p1} vs ${p2}`}>
      <div className={`bracket-side ${win1 ? 'winner' : ''} ${Number(match.player1_is_bye) ? 'bye' : ''}`}>
        <span className="bracket-player">{p1}</span>
        {showScore && <span className="bracket-score">{match.score1 ?? ''}</span>}
      </div>
      <div className={`bracket-side ${win2 ? 'winner' : ''} ${Number(match.player2_is_bye) ? 'bye' : ''}`}>
        <span className="bracket-player">{p2}</span>
        {showScore && <span className="bracket-score">{match.score2 ?? ''}</span>}
      </div>
    </div>
  );
}

function RoundColumn({ round, matches, players }) {
  return (
    <div className="bracket-column">
      <div className="bracket-round-title">Round {round}</div>
      <div className="bracket-column-body">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} players={players} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, matches, players, ceiling }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  if (!rounds.length) return null;
  return (
    <div className="bracket-section">
      <h4 className="bracket-section-title">{title}</h4>
      <div className="bracket" style={{ '--bracket-rounds': ceiling || rounds.length }}>
        {rounds.map((r) => (
          <RoundColumn key={r} round={r} matches={matches.filter((m) => m.round === r)} players={players} />
        ))}
      </div>
    </div>
  );
}

export default function Bracket({ matches, players, format }) {
  const visible = matches.filter((m) => m.status !== 'waiting' || m.player1_id || m.player2_id);
  const map = players instanceof Map ? players : new Map((players || []).map((p) => [p.id, p]));

  const main = visible.filter((m) => m.bracket === 'main');
  const losers = visible.filter((m) => m.bracket === 'losers');
  const grand = visible.filter((m) => m.bracket === 'grand_final');
  const mainCeiling = Math.max(...main.map((m) => m.round), 0);

  return (
    <div className="bracket-wrap">
      <Section title="Winners Bracket" matches={main} players={map} ceiling={mainCeiling} />
      {format === 'double_elim' && losers.length > 0 && (
        <Section title="Losers Bracket" matches={losers} players={map} ceiling={Math.max(...losers.map((m) => m.round))} />
      )}
      {grand.length > 0 && (
        <div className="bracket-section">
          <h4 className="bracket-section-title">Grand Final</h4>
          <div className="bracket grand">
            {grand
              .filter((m) => m.status !== 'waiting' || m.player1_id || m.player2_id)
              .map((m) => (
                <div key={m.id} className="bracket-column">
                  <div className="bracket-round-title">{m.label}</div>
                  <div className="bracket-column-body">
                    <MatchCard match={m} players={map} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
      {!main.length && <p className="muted">Bracket has not been generated yet.</p>}
      <p className="muted small">{FORMAT_LABELS[format] || format}</p>
    </div>
  );
}
