import { Link } from 'react-router-dom';
import DeckArt, { PlayerAvatar } from './DeckArt.jsx';
import { deckLabel } from '../match-status.js';

// Champion + podium for completed events. Data is always derived from
// approved results passed in by the API bundle.
export default function ChampionShowcase({ t, champion, standings = [], players = [] }) {
  const podium = standings.filter((s) => !s.dropped).slice(0, 3);
  const winner = champion || podium[0] || null;

  if (!winner) return null;
  if (t?.status !== 'completed' && !champion) return null;

  const byId = new Map(players.map((p) => [Number(p.id), p]));
  const byUser = new Map(players.map((p) => [Number(p.user_id), p]));
  const winnerPlayer = byId.get(Number(winner.id)) || byUser.get(Number(winner.userId)) || winner;
  const rankOrder = [1, 0, 2].map((i) => podium[i]).filter(Boolean);

  return (
    <div className="champion-showcase">
      <div className="champion-glow" aria-hidden="true" />
      <div className="champion-main">
        <DeckArt
          src={winnerPlayer.deck_art}
          alt={`${winner.name}'s championship Vanguard`}
          themeKey={winnerPlayer.card_theme}
          size="xl"
          featured={winnerPlayer.deck_featured}
          className="champion-art"
        />
        <div className="champion-copy">
          <span className="eyebrow">🏆 Tournament champion</span>
          <h2>
            {winnerPlayer.user_id ? (
              <Link to={`/players/${winnerPlayer.user_id}`}>{winner.name}</Link>
            ) : (
              winner.name
            )}
          </h2>
          <p className="champion-deck">
            {deckLabel(winnerPlayer) || 'Champion deck'}
            {winnerPlayer.deck_featured ? ` · ${winnerPlayer.deck_featured}` : ''}
          </p>
          {winnerPlayer.deck_nation && <span className="chip">{winnerPlayer.deck_nation}</span>}
          {winnerPlayer.deck_playstyle && <p className="muted small">{winnerPlayer.deck_playstyle}</p>}
        </div>
      </div>

      {rankOrder.length > 1 && (
        <div className="podium">
          {rankOrder.map((s) => {
            const p = byId.get(Number(s.id)) || byUser.get(Number(s.userId)) || {};
            const record = `${s.matchWins}-${s.matchLosses}${s.draws ? `-${s.draws}` : ''}`;
            const place = s.rank === 1 ? '1st' : s.rank === 2 ? '2nd' : '3rd';
            return (
              <div key={s.id} className={`podium-card podium-${s.rank}`}>
                <span className="podium-place">{place}</span>
                <PlayerAvatar user={{ name: s.name, avatar: p.avatar }} size="md" />
                <div className="podium-name">
                  {p.user_id ? <Link to={`/players/${p.user_id}`}>{s.name}</Link> : s.name}
                </div>
                <span className="muted small">
                  {record} · {s.points} pts
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
