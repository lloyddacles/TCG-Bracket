import { useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import FighterCard from '../components/FighterCard.jsx';
import { THEME_GROUPS, DEFAULT_THEME, getTheme } from '../card-themes.js';

export default function CardStudio() {
  const { user, setUser } = useAuth();
  const [theme, setTheme] = useState(user?.cardTheme || DEFAULT_THEME);
  const [title, setTitle] = useState(user?.cardTitle || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const cardRef = useRef(null);

  const dirty = theme !== (user?.cardTheme || DEFAULT_THEME) || title !== (user?.cardTitle || '');
  const previewUser = useMemo(
    () => ({ ...user, cardTheme: theme, cardTitle: title }),
    [user, theme, title]
  );

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await api.updateCard({ theme, title });
      setUser(data.user);
      setMessage('Fighter card saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!cardRef.current) return;
    setError('');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${user?.username || 'fighter'}-fighter-card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      setError(`Could not export image: ${err.message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Fighter ID card</h1>
        <p className="muted">
          This QR is your personal fighter license. Show it at the table — the organizer scans it to check you into a
          tournament.
        </p>
      </div>

      <div className="card-studio">
        <div className="studio-preview">
          <div ref={cardRef}>
            <FighterCard user={previewUser} />
          </div>
          <div className="card-actions no-print">
            <button type="button" className="btn btn-primary" onClick={download}>
              Download PNG
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>

        <div className="stack no-print">
          <div className="card stack">
            <h3>Choose your nation or collab theme</h3>
            <p className="muted">
              Fifteen themed frames — the six Vanguard nations plus collaboration sets. Pick the one that matches
              your deck and reputation.
            </p>
            {THEME_GROUPS.map((group) => (
              <div key={group.id} className="theme-group">
                <h4 className="theme-group-title">
                  {group.label}
                  <span className="muted small">{group.keys.length}</span>
                </h4>
                <div className="theme-grid">
                  {group.keys.map((key) => {
                    const t = getTheme(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`theme-swatch${theme === key ? ' active' : ''}`}
                        style={{ background: t.frame }}
                        onClick={() => setTheme(key)}
                        aria-pressed={theme === key}
                      >
                        <span className="emblem" aria-hidden="true">
                          {t.emblem}
                        </span>
                        <strong>
                          {t.label}
                          <span className="theme-code">{t.code}</span>
                        </strong>
                        <em>{t.tagline}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="card stack">
            <h3>Fighter title</h3>
            <label className="field">
              <span>Title (optional)</span>
              <input
                value={title}
                maxLength={40}
                placeholder="e.g. Blazing Duelist"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            {message && <div className="alert alert-success">{message}</div>}
            {error && <div className="alert alert-error">{error}</div>}
            <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
              {saving ? 'Saving…' : 'Save card'}
            </button>
            {!user?.qrToken && (
              <p className="muted">Your QR token is being issued on the server — refresh in a moment.</p>
            )}
          </div>

          <div className="card stack">
            <h3>How check-in works</h3>
            <ol className="muted" style={{ paddingLeft: '1.1rem', lineHeight: 1.7 }}>
              <li>Pick a theme and save your card (above).</li>
              <li>At the venue, open this page and show your QR.</li>
              <li>The organizer opens the Scan desk and scans it — you are checked into the tournament instantly.</li>
              <li>Your deck can be added at check-in, or edited later from the tournament roster.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
