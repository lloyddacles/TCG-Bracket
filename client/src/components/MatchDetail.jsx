import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import DeckArt, { PlayerAvatar } from './DeckArt.jsx';
import { matchPhase, isPlayable, playerName, deckLabel } from '../match-status.js';

const HISTORY_LABELS = {
  reported: 'Reported',
  approved: 'Approved',
  result_set: 'Result',
  reset: 'Cleared',
  disputed: 'Disputed',
  bye: 'Bye',
  deck_reviewed: 'Deck review',
};

function deckStatusLabel(status) {
  if (status === 'approved') return { text: 'Deck approved', tone: 'ok' };
  if (status === 'rejected') return { text: 'Deck rejected', tone: 'danger' };
  if (status === 'pending') return { text: 'Deck pending review', tone: 'warn' };
  return { text: 'No deck submitted', tone: 'muted' };
}

function DeckPanel({ player, side, winner }) {
  if (!player) {
    return (
      <div className="md-side md-side-empty">
        <span className="md-slot">{side === 1 ? 'Player 1' : 'Player 2'}</span>
        <strong className="muted">Awaiting winner</strong>
      </div>
    );
  }
  const status = deckStatusLabel(player.deck_status);
  return (
    <div className={`md-side ${winner ? 'is-winner' : ''}`}>
      <div className="md-side-head">
        <PlayerAvatar user={{ name: player.name, avatar: player.avatar }} size="md" />
        <div className="md-side-name">
          <span className="md-slot">Player {side}</span>
          <strong>{player.name}</strong>
          {player.seed != null && <em className="muted small">Seed {player.seed}</em>}
        </div>
      </div>
      <DeckArt
        src={player.deck_art}
        alt={`${player.name}'s Vanguard`}
        themeKey={player.card_theme}
        size="lg"
        featured={player.deck_featured}
        className="md-art"
      />
      <div className="md-deck-meta">
        <span className="md-deck-label">Vanguard unit</span>
        <strong>{player.deck_featured || 'Not registered'}</strong>
        <span className="md-deck-label">Deck</span>
        <strong>{deckLabel(player) || 'No deck name'}</strong>
        <div className="md-deck-row">
          {player.deck_nation && <span className="chip">{player.deck_nation}</span>}
          <span className={`tag tag-${status.tone === 'danger' ? 'warn' : status.tone}`}>{status.text}</span>
        </div>
        {player.deck_playstyle && <p className="md-playstyle">{player.deck_playstyle}</p>}
        {player.deck_status === 'rejected' && player.deck_note && (
          <p className="md-note">Organizer note: {player.deck_note}</p>
        )}
      </div>
    </div>
  );
}

export default function MatchDetail({
  match,
  playersMap,
  t,
  isAdmin,
  user,
  onClose,
  onApply,
  onError,
  readOnly = false,
}) {
  const [history, setHistory] = useState([]);
  const [s1, setS1] = useState(match?.score1 ?? '');
  const [s2, setS2] = useState(match?.score2 ?? '');
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setS1(match?.score1 ?? '');
    setS2(match?.score2 ?? '');
    setDisputeOpen(false);
    setReason('');
  }, [match?.id, match?.score1, match?.score2]);

  const loadHistory = useCallback(async () => {
    if (readOnly || !t?.id || !match?.id) return;
    try {
      const data = await api.getTournamentHistory(t.id);
      setHistory((data.events || []).filter((e) => Number(e.matchId) === Number(match.id)).slice(0, 6));
    } catch {
      setHistory([]);
    }
  }, [readOnly, t?.id, match?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (!match) return null;

  const p1 = match.player1_id != null ? playersMap.get(match.player1_id) : null;
  const p2 = match.player2_id != null ? playersMap.get(match.player2_id) : null;
  const phase = matchPhase(match);
  const win1 = match.winner_id != null && Number(match.winner_id) === Number(match.player1_id);
  const win2 = match.winner_id != null && Number(match.winner_id) === Number(match.player2_id);
  const me = p1?.user_id === user?.id ? p1 : p2?.user_id === user?.id ? p2 : null;
  const cap = Math.ceil((t?.best_of || 3) / 2);
  const canDispute = !readOnly && me && match.status === 'reported';
  const canApprove = !readOnly && isAdmin && ['reported', 'disputed'].includes(match.status) && isPlayable(match);
  const canSet = !readOnly && isAdmin && ['pending', 'reported', 'disputed'].includes(match.status) && isPlayable(match);
  const canClear = !readOnly && isAdmin && ['reported', 'disputed'].includes(match.status);

  const run = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setLocalError('');
    try {
      const bundle = await fn();
      if (bundle) onApply(bundle);
    } catch (err) {
      setLocalError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  };

  const quick = cap === 1 ? [[1, 0], [0, 1]] : cap === 3 ? [[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]] : [[2, 0], [2, 1], [1, 2], [0, 2]];

  return (
    <Modal
      title={`${match.label || `Round ${match.round}`} · Match ${match.match_index + 1}`}
      onClose={onClose}
      wide
    >
      <div className="match-detail">
        <div className="md-status">
          <span className={`match-phase phase-${phase.key}`}>{phase.label}</span>
          <span className="muted small">
            Round {match.round}
            {t?.best_of ? ` · Best of ${t.best_of}` : ''}
          </span>
        </div>

        <div className="md-arena">
          <DeckPanel player={p1} side={1} winner={win1} />
          <div className={`md-score ${match.status === 'approved' ? 'is-final' : ''}`}>
            <span className={`md-score-num ${win1 ? 'winner' : ''}`}>{match.score1 ?? '–'}</span>
            <span className="md-vs">vs</span>
            <span className={`md-score-num ${win2 ? 'winner' : ''}`}>{match.score2 ?? '–'}</span>
            {match.status === 'approved' && !match.is_draw && (
              <span className="md-verdict">
                {playerName(playersMap, match.winner_id)} wins
              </span>
            )}
            {match.is_draw && <span className="md-verdict">Draw</span>}
          </div>
          <DeckPanel player={p2} side={2} winner={win2} />
        </div>

        {match.status === 'disputed' && (
          <div className="alert alert-error">
            <strong>Result disputed.</strong> {match.dispute_reason || 'Awaiting organizer review.'}
          </div>
        )}

        {localError && <div className="alert alert-error">{localError}</div>}

        {!readOnly && (canApprove || canSet || canClear || canDispute) && (
          <div className="md-controls">
            {canApprove && (
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api.approveMatch(match.id, { score1: match.score1, score2: match.score2 }),
                    'Approve this result and advance the winner?'
                  )
                }
              >
                Confirm result
              </button>
            )}

            {canSet && (
              <div className="md-score-entry">
                <label className="field inline">
                  <span>{p1?.name || 'Player 1'}</span>
                  <input type="number" min={0} max={cap} value={s1} onChange={(e) => setS1(e.target.value)} />
                </label>
                <span className="muted">–</span>
                <label className="field inline">
                  <span>{p2?.name || 'Player 2'}</span>
                  <input type="number" min={0} max={cap} value={s2} onChange={(e) => setS2(e.target.value)} />
                </label>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy || s1 === '' || s2 === ''}
                  onClick={() =>
                    run(
                      () => api.setMatchResult(match.id, { score1: Number(s1), score2: Number(s2) }),
                      'Record this result? The winner will advance immediately.'
                    )
                  }
                >
                  Record result
                </button>
                <div className="quick-scores">
                  {quick.map(([a, b]) => (
                    <button
                      key={`${a}-${b}`}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setS1(a);
                        setS2(b);
                      }}
                    >
                      {a}–{b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {canClear && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => run(() => api.resetMatch(match.id), 'Clear this result?')}
              >
                Clear result
              </button>
            )}

            {canDispute && !disputeOpen && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDisputeOpen(true)}>
                Dispute result
              </button>
            )}
          </div>
        )}

        {disputeOpen && (
          <form
            className="md-dispute"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.disputeMatch(match.id, reason));
            }}
          >
            <label className="field">
              <span>What is wrong with this result?</span>
              <input
                value={reason}
                maxLength={300}
                placeholder="Scores were entered incorrectly…"
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <div className="row-actions">
              <button className="btn btn-primary btn-sm" disabled={busy}>
                Submit dispute
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDisputeOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="md-extra">
          <div className="md-history">
            <h4>Match history</h4>
            {readOnly && <p className="muted small">Sign in to view the audit trail.</p>}
            {!readOnly && history.length === 0 && <p className="muted small">No recorded actions yet.</p>}
            {history.length > 0 && (
              <ul className="event-list compact">
                {history.map((e) => (
                  <li key={e.id} className="event-row">
                    <span className={`event-action action-${e.action}`}>
                      {HISTORY_LABELS[e.action] || e.action}
                    </span>
                    <span className="event-summary">{e.summary || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="md-decklist">
            <h4>Registered deck</h4>
            {(p1?.profile_deck_list || p2?.profile_deck_list) ? (
              <div className="md-decklists">
                {p1?.profile_deck_list && (
                  <details>
                    <summary>{p1.name}</summary>
                    <pre className="deck-list">{p1.profile_deck_list}</pre>
                  </details>
                )}
                {p2?.profile_deck_list && (
                  <details>
                    <summary>{p2.name}</summary>
                    <pre className="deck-list">{p2.profile_deck_list}</pre>
                  </details>
                )}
              </div>
            ) : (
              <p className="muted small">No decklists submitted for this match.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
