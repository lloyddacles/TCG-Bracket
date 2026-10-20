import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Spinner from '../components/Spinner.jsx';
import { FORMAT_LABELS, STATUS_LABELS, statusClass } from '../format.js';

function pct(part, whole) {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export default function Profile() {
  const { user, setUser } = useAuth();
  const { id } = useParams();
  const targetId = id ? Number(id) : null;
  const isSelf = !targetId || targetId === user?.id;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [deckName, setDeckName] = useState('');
  const [deckList, setDeckList] = useState('');
  const [deckDirty, setDeckDirty] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isSelf ? await api.getProfile() : await api.getPlayerProfile(targetId);
      setProfile(data);
      setDeckName(data.user.deckName || '');
      setDeckList(data.user.deckList || '');
      setDeckDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isSelf, targetId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDeck = async (e) => {
    e.preventDefault();
    setSavingDeck(true);
    setError('');
    setNotice('');
    try {
      const res = await api.saveDeck({ deckName, deckList });
      if (res.user) setUser(res.user);
      setDeckDirty(false);
      setNotice('Deck saved.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDeck(false);
    }
  };

  if (loading) return <Spinner full />;
  if (!profile) {
    return (
      <div className="page narrow">
        <div className="alert alert-error">{error || 'Player not found'}</div>
      </div>
    );
  }

  const { user: player, totals, history, matches, matchTotal } = profile;
  const allTournaments = history;
  const winRate = pct(totals.wins, totals.matches);
  const gameRate = pct(totals.gameWins, totals.gameWins + totals.gameLosses);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{isSelf ? 'Your profile' : `${player.name}'s profile`}</h1>
        {!isSelf && <Link className="btn btn-ghost" to="/">Back</Link>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card stack">
        <div className="profile-head">
          <span className="user-avatar big">{(player.name || '?').charAt(0).toUpperCase()}</span>
          <div>
            <h2>{player.name}</h2>
            <p className="muted">
              @{player.username} · {player.role === 'admin' ? 'Tournament Organizer' : 'Player'}
            </p>
            {player.deckName && <p className="muted small">Signature deck: {player.deckName}</p>}
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Tournaments" value={totals.tournaments} sub={`${totals.completed} completed`} />
          <StatCard label="Match record" value={`${totals.wins}-${totals.losses}-${totals.draws}`} sub={`${winRate} win rate`} />
          <StatCard label="Games" value={`${totals.gameWins}-${totals.gameLosses}`} sub={`${gameRate} won`} />
          <StatCard label="1st places" value={totals.firstPlaces} sub={`${totals.podiums} podium finishes`} />
        </div>
        {totals.byes > 0 && <p className="muted small">Includes {totals.byes} bye(s).</p>}
      </div>

      {isSelf && (
        <div className="card stack">
          <h3>Decklist</h3>
          <p className="muted small">
            Your signature deck. It is saved to your account and shown on your profile.
          </p>
          <form className="stack" onSubmit={saveDeck}>
            <label className="field">
              <span>Deck name</span>
              <input
                type="text"
                value={deckName}
                maxLength={80}
                placeholder="e.g. Dragon Empire Blademaster"
                onChange={(e) => {
                  setDeckName(e.target.value);
                  setDeckDirty(true);
                }}
              />
            </label>
            <label className="field">
              <span>Decklist</span>
              <textarea
                rows={8}
                value={deckList}
                placeholder={'4x Dragonic Overlord\n4x Berserk Dragon\n…'}
                onChange={(e) => {
                  setDeckList(e.target.value);
                  setDeckDirty(true);
                }}
              />
            </label>
            <button className="btn btn-primary" disabled={savingDeck || !deckDirty}>
              {savingDeck ? 'Saving…' : deckDirty ? 'Save deck' : 'Saved'}
            </button>
          </form>
        </div>
      )}

      {!isSelf && player.deckList && (
        <div className="card stack">
          <h3>Decklist{player.deckName ? ` — ${player.deckName}` : ''}</h3>
          <pre className="deck-list">{player.deckList}</pre>
        </div>
      )}

      <div className="card stack">
        <h3>Tournament history</h3>
        {allTournaments.length === 0 && <p className="muted">No tournaments yet.</p>}
        {allTournaments.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tournament</th>
                  <th>Format</th>
                  <th>Result</th>
                  <th className="num">Record</th>
                  <th className="num">Place</th>
                </tr>
              </thead>
              <tbody>
                {allTournaments.map((h) => (
                  <tr key={h.tournamentId}>
                    <td>
                      <Link to={`/tournaments/${h.tournamentId}`} className="player-link">
                        {h.name}
                      </Link>
                      <div className="muted small">{h.game}</div>
                    </td>
                    <td>{FORMAT_LABELS[h.format] || h.format}</td>
                    <td>
                      <span className={statusClass(h.status)}>{STATUS_LABELS[h.status] || h.status}</span>
                      {h.dropped && <span className="tag tag-muted">dropped</span>}
                    </td>
                    <td className="num">
                      {h.record.wins}-{h.record.losses}-{h.record.draws}
                    </td>
                    <td className="num">
                      {h.rank ? `${h.rank}${h.playerCount ? ` / ${h.playerCount}` : ''}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="spread">
          <h3>Recent matches</h3>
          {matchTotal > matches.length && (
            <span className="muted small">Showing {matches.length} of {matchTotal}</span>
          )}
        </div>
        {matches.length === 0 && <p className="muted">No completed matches yet.</p>}
        {matches.length > 0 && (
          <ul className="match-list">
            {matches.map((m) => (
              <li key={m.matchId} className={`match-item result-${m.result}`}>
                <span className={`match-result ${m.result}`}>{m.result}</span>
                <span className="match-opponent">
                  vs {m.opponent || 'Bye'}
                  <span className="muted small">
                    {' '}
                    · {m.tournamentName} · R{m.round}
                  </span>
                </span>
                <span className="match-score">
                  {m.myScore}–{m.oppScore}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isSelf && <ChangePassword setUser={setUser} />}
    </div>
  );
}

function ChangePassword({ setUser }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const data = await api.changePassword(current, next);
      setUser(data.user);
      setCurrent('');
      setNext('');
      setMessage('Password updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>Change password</h3>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          <span>Current password</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
