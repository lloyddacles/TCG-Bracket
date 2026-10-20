import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Spinner from '../components/Spinner.jsx';
import { FORMAT_LABELS, STATUS_LABELS, statusClass } from '../format.js';
import DeckArt, { PlayerAvatar } from '../components/DeckArt.jsx';
import { imageFileToDataUrl } from '../images.js';

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
  const [deckFeatured, setDeckFeatured] = useState('');
  const [deckNation, setDeckNation] = useState('');
  const [deckPlaystyle, setDeckPlaystyle] = useState('');
  const [deckArt, setDeckArt] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [deckDirty, setDeckDirty] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);
  const [artBusy, setArtBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isSelf ? await api.getProfile() : await api.getPlayerProfile(targetId);
      setProfile(data);
      setDeckName(data.user.deckName || '');
      setDeckList(data.user.deckList || '');
      setDeckFeatured(data.user.deckFeatured || '');
      setDeckNation(data.user.deckNation || '');
      setDeckPlaystyle(data.user.deckPlaystyle || '');
      setDeckArt(data.user.deckArt || null);
      setAvatar(data.user.avatar || null);
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

  const uploadImage = async (file, kind) => {
    setArtBusy(true);
    setError('');
    try {
      const url = await imageFileToDataUrl(file, { maxSize: kind === 'avatar' ? 480 : 900 });
      if (kind === 'avatar') setAvatar(url);
      else setDeckArt(url);
      setDeckDirty(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setArtBusy(false);
    }
  };

  const saveDeck = async (e) => {
    e.preventDefault();
    setSavingDeck(true);
    setError('');
    setNotice('');
    try {
      const res = await api.saveDeck({
        deckName,
        deckList,
        deckFeatured,
        deckNation,
        deckPlaystyle,
        deckArt: deckArt || null,
        avatar: avatar || null,
      });
      if (res.user) setUser(res.user);
      setDeckDirty(false);
      setNotice('Deck profile saved.');
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

      <div className="card stack profile-hero">
        <div className="profile-head">
          <PlayerAvatar user={player} size="lg" />
          <div className="profile-head-copy">
            <h2>{player.name}</h2>
            <p className="muted">
              @{player.username} · {player.role === 'admin' ? 'Tournament Organizer' : 'Player'}
            </p>
            {player.deckName && <p className="muted small">Signature deck: {player.deckName}</p>}
            <div className="profile-chips">
              {player.deckNation && <span className="chip">{player.deckNation}</span>}
              {player.deckFeatured && <span className="chip">{player.deckFeatured}</span>}
            </div>
          </div>
          <DeckArt
            src={player.deckArt}
            alt={`${player.name}'s featured Vanguard`}
            themeKey={player.cardTheme}
            size="md"
            featured={player.deckFeatured}
            className="profile-hero-art"
          />
        </div>

        <div className="stat-grid">
          <StatCard label="Tournaments" value={totals.tournaments} sub={`${totals.completed} completed`} />
          <StatCard label="Match record" value={`${totals.wins}-${totals.losses}-${totals.draws}`} sub={`${winRate} win rate`} />
          <StatCard label="Games" value={`${totals.gameWins}-${totals.gameLosses}`} sub={`${gameRate} won`} />
          <StatCard label="1st places" value={totals.firstPlaces} sub={`${totals.podiums} podium finishes`} />
        </div>
        {totals.byes > 0 && <p className="muted small">Includes {totals.byes} bye(s).</p>}
      </div>

      <div className="card stack achievements-card">
        <div className="spread">
          <h3>Achievements</h3>
          <span className="muted small">{(profile.achievements || []).length} earned</span>
        </div>
        {(profile.achievements || []).length === 0 ? (
          <p className="muted small">Win your first approved match to start earning achievements.</p>
        ) : (
          <div className="achievement-grid">
            {(profile.achievements || []).map((a) => (
              <div key={a.id} className={`achievement badge-${a.tier}`}>
                <span className="achievement-icon">{a.icon}</span>
                <div>
                  <strong>{a.name}</strong>
                  <p className="muted small">{a.description}</p>
                  {a.progress && <span className="tag">{a.progress}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isSelf && (
        <div className="card stack deck-editor">
          <h3>Deck profile</h3>
          <p className="muted small">
            Register your featured Vanguard unit, nation and deck. Uploaded artwork is resized automatically
            and shown in the bracket and match view. Edits to an event deck are re-submitted for organizer
            approval.
          </p>
          <form className="stack" onSubmit={saveDeck}>
            <div className="deck-editor-art">
              <div className="deck-editor-preview">
                <DeckArt
                  src={deckArt}
                  alt="Deck artwork preview"
                  themeKey={player.cardTheme}
                  size="lg"
                  featured={deckFeatured}
                />
                <div className="art-buttons">
                  <label className="btn btn-ghost btn-sm file-button">
                    {artBusy ? 'Processing…' : 'Upload artwork'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={artBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadImage(file, 'art');
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {deckArt && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setDeckArt(null);
                        setDeckDirty(true);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="stack deck-editor-fields">
                <label className="field">
                  <span>Artwork URL (optional)</span>
                  <input
                    value={deckArt && !deckArt.startsWith('data:') ? deckArt : ''}
                    placeholder="https://…"
                    onChange={(e) => {
                      setDeckArt(e.target.value.trim() || null);
                      setDeckDirty(true);
                    }}
                  />
                </label>
                <label className="field">
                  <span>Featured Vanguard unit</span>
                  <input
                    value={deckFeatured}
                    maxLength={80}
                    placeholder="e.g. Dragonic Overlord the End"
                    onChange={(e) => {
                      setDeckFeatured(e.target.value);
                      setDeckDirty(true);
                    }}
                  />
                </label>
                <div className="grid-2">
                  <label className="field">
                    <span>Nation / collab</span>
                    <input
                      value={deckNation}
                      maxLength={60}
                      placeholder="e.g. Dragon Empire"
                      onChange={(e) => {
                        setDeckNation(e.target.value);
                        setDeckDirty(true);
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Profile image</span>
                    <div className="avatar-upload">
                      <PlayerAvatar user={{ name: player.name, avatar }} size="sm" />
                      <label className="btn btn-ghost btn-sm file-button">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          disabled={artBusy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadImage(file, 'avatar');
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {avatar && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setAvatar(null);
                            setDeckDirty(true);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>

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
              <span>Playstyle</span>
              <textarea
                rows={3}
                maxLength={600}
                value={deckPlaystyle}
                placeholder="Aggressive restanding vanguard with a explosive mid-game…"
                onChange={(e) => {
                  setDeckPlaystyle(e.target.value);
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
            <button className="btn btn-primary" disabled={savingDeck || !deckDirty || artBusy}>
              {savingDeck ? 'Saving…' : deckDirty ? 'Save deck profile' : 'Saved'}
            </button>
          </form>
        </div>
      )}

      {!isSelf && (player.deckName || player.deckList || player.deckArt) && (
        <div className="card stack deck-profile-card">
          <div className="deck-profile-head">
            <DeckArt
              src={player.deckArt}
              alt={`${player.name}'s featured Vanguard`}
              themeKey={player.cardTheme}
              size="md"
              featured={player.deckFeatured}
            />
            <div>
              <h3>{player.deckName || 'Deck profile'}</h3>
              {player.deckFeatured && <p className="muted small">Featured unit: {player.deckFeatured}</p>}
              <div className="profile-chips">
                {player.deckNation && <span className="chip">{player.deckNation}</span>}
              </div>
              {player.deckPlaystyle && <p className="muted small">{player.deckPlaystyle}</p>}
            </div>
          </div>
          {player.deckList && <pre className="deck-list">{player.deckList}</pre>}
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
