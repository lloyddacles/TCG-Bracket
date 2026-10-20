import { useEffect, useMemo, useState } from 'react';
import DeckArt from './DeckArt.jsx';
import { matchPhase, playerName, deckLabel } from '../match-status.js';

function useMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

function Side({ player, isBye, score, winner, lost }) {
  return (
    <div className={`bracket-side ${winner ? 'winner' : ''} ${lost ? 'lost' : ''} ${isBye ? 'bye' : ''}`}>
      <DeckArt
        src={player?.deck_art}
        alt={player ? `${player.name}'s Vanguard` : 'Awaiting player'}
        themeKey={player?.card_theme}
        size="xs"
      />
      <span className="bracket-side-text">
        <span className="bracket-player">{isBye ? 'BYE' : player?.name || 'TBD'}</span>
        {player && <span className="bracket-deck">{deckLabel(player) || 'No deck registered'}</span>}
      </span>
      {score != null && <span className="bracket-score">{score}</span>}
    </div>
  );
}

function MatchCard({ match, players, onSelect, currentRound, highlightId }) {
  const phase = matchPhase(match);
  const p1 = match.player1_id != null ? players.get(match.player1_id) : null;
  const p2 = match.player2_id != null ? players.get(match.player2_id) : null;
  const decided = match.status === 'approved' && !Number(match.is_bye);
  const win1 = decided && match.winner_id != null && Number(match.winner_id) === Number(match.player1_id);
  const win2 = decided && match.winner_id != null && Number(match.winner_id) === Number(match.player2_id);
  const highlight = highlightId != null && Number(highlightId) === Number(match.id);
  const isCurrent = Number(match.round) === Number(currentRound);
  const clickable = typeof onSelect === 'function';

  const content = (
    <>
      <div className="bracket-card-head">
        <span className={`match-phase phase-${phase.key}`}>{phase.label}</span>
        <span className="bracket-label">
          {match.label || `R${match.round}`}
          {match.match_index != null ? ` · ${match.match_index + 1}` : ''}
        </span>
      </div>
      <Side
        player={p1}
        isBye={Number(match.player1_is_bye)}
        score={match.score1}
        winner={win1}
        lost={decided && !win1 && !match.is_draw}
      />
      <Side
        player={p2}
        isBye={Number(match.player2_is_bye)}
        score={match.score2}
        winner={win2}
        lost={decided && !win2 && !match.is_draw}
      />
      {clickable && <span className="bracket-open" aria-hidden="true">Details</span>}
    </>
  );

  const className = `bracket-card phase-${phase.key} ${isCurrent ? 'is-current' : ''} ${highlight ? 'just-resolved' : ''}`;

  if (!clickable) {
    return (
      <div className={className} title={`${playerName(players, match.player1_id)} vs ${playerName(players, match.player2_id)}`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onSelect(match)}
      title={`${playerName(players, match.player1_id)} vs ${playerName(players, match.player2_id)} — view match`}
    >
      {content}
    </button>
  );
}

function Section({ title, matches, players, ceiling, currentRound, onSelect, highlightId }) {
  const rounds = [...new Set(matches.map((m) => Number(m.round)))].sort((a, b) => a - b);
  const roundKey = rounds.join(',');
  const isMobile = useMedia('(max-width: 820px)');
  const fallback = currentRound && rounds.includes(Number(currentRound)) ? Number(currentRound) : rounds[0];
  const [active, setActive] = useState(fallback);

  useEffect(() => {
    if (currentRound && rounds.includes(Number(currentRound))) setActive(Number(currentRound));
  }, [currentRound, roundKey]);

  useEffect(() => {
    if (!rounds.includes(active)) setActive(fallback);
  }, [roundKey, active, fallback]);

  if (!rounds.length) return null;

  const shown = isMobile ? rounds.filter((r) => r === active) : rounds;
  const index = rounds.indexOf(active);

  return (
    <section className="bracket-section">
      <div className="bracket-section-head">
        <h4 className="bracket-section-title">{title}</h4>
        {isMobile && rounds.length > 1 && (
          <div className="round-picker compact">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Previous round"
              disabled={index <= 0}
              onClick={() => setActive(rounds[Math.max(0, index - 1)])}
            >
              ←
            </button>
            <select value={active} onChange={(e) => setActive(Number(e.target.value))} aria-label="Round">
              {rounds.map((r) => (
                <option key={r} value={r}>
                  Round {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Next round"
              disabled={index >= rounds.length - 1}
              onClick={() => setActive(rounds[Math.min(rounds.length - 1, index + 1)])}
            >
              →
            </button>
          </div>
        )}
      </div>
      <div className="bracket" style={{ '--bracket-rounds': ceiling || rounds.length }}>
        {shown.map((r) => (
          <div key={r} className={`bracket-column ${Number(r) === Number(currentRound) ? 'is-current' : ''}`}>
            <div className="bracket-round-title">
              Round {r}
              {Number(r) === Number(currentRound) && <span className="current-dot" aria-label="current round" />}
            </div>
            <div className="bracket-column-body">
              {matches
                .filter((m) => Number(m.round) === r)
                .map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    players={players}
                    onSelect={onSelect}
                    currentRound={currentRound}
                    highlightId={highlightId}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Bracket({
  matches,
  players,
  format,
  currentRound,
  onSelectMatch,
  champion,
  highlightId,
}) {
  const map = useMemo(
    () => (players instanceof Map ? players : new Map((players || []).map((p) => [p.id, p]))),
    [players]
  );
  const visible = (matches || []).filter(
    (m) => m.status !== 'waiting' || m.player1_id || m.player2_id
  );

  const main = visible.filter((m) => m.bracket === 'main');
  const losers = visible.filter((m) => m.bracket === 'losers');
  const grand = visible.filter((m) => m.bracket === 'grand_final');
  const mainCeiling = Math.max(0, ...main.map((m) => Number(m.round)));
  const loserCeiling = Math.max(0, ...losers.map((m) => Number(m.round)));

  return (
    <div className="bracket-wrap">
      {champion && (
        <div className="bracket-champion">
          <DeckArt
            src={champion.deck_art}
            alt={`${champion.name}'s champion Vanguard`}
            themeKey={champion.card_theme}
            size="sm"
            featured={champion.deck_featured}
          />
          <div>
            <span className="eyebrow">Tournament champion</span>
            <strong>{champion.name}</strong>
            <span className="muted small">{deckLabel(champion) || champion.deck_featured || 'Champion'}</span>
          </div>
          <span className="champion-trophy" aria-hidden="true">🏆</span>
        </div>
      )}

      <Section
        title="Winners Bracket"
        matches={main}
        players={map}
        ceiling={mainCeiling}
        currentRound={currentRound}
        onSelect={onSelectMatch}
        highlightId={highlightId}
      />
      {format === 'double_elim' && losers.length > 0 && (
        <Section
          title="Losers Bracket"
          matches={losers}
          players={map}
          ceiling={loserCeiling}
          currentRound={currentRound}
          onSelect={onSelectMatch}
          highlightId={highlightId}
        />
      )}
      {grand.length > 0 && (
        <section className="bracket-section">
          <div className="bracket-section-head">
            <h4 className="bracket-section-title">Grand Final</h4>
          </div>
          <div className="bracket grand">
            {grand.map((m) => (
              <div key={m.id} className="bracket-column">
                <div className="bracket-round-title">{m.label}</div>
                <div className="bracket-column-body">
                  <MatchCard
                    match={m}
                    players={map}
                    onSelect={onSelectMatch}
                    currentRound={currentRound}
                    highlightId={highlightId}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {!visible.length && (
        <div className="empty-state">
          <span aria-hidden="true">⚔</span>
          <p className="muted">The bracket appears once the organizer starts the tournament.</p>
        </div>
      )}
    </div>
  );
}
