import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import FighterCard from '../components/FighterCard.jsx';
import { STATUS_LABELS } from '../format.js';
import { getTheme } from '../card-themes.js';

let feedSeq = 0;

function parseToken(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('TCGBRACKET:')) return trimmed.slice('TCGBRACKET:'.length);
  return trimmed;
}

export default function ScanDesk() {
  const { user, isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState('');
  const [bundle, setBundle] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  const qrRef = useRef(null);
  const selectedIdRef = useRef('');
  const busyRef = useRef(false);
  const lastScanRef = useRef({ token: '', at: 0 });

  useEffect(() => {
    selectedIdRef.current = tournamentId;
  }, [tournamentId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api.getTournaments();
        if (!alive) return;
        const open = data.tournaments.filter((t) => t.status === 'registration' || t.status === 'active');
        setTournaments(open);
        if (open.length) setTournamentId(String(open[0].id));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadBundle = useCallback(async (id) => {
    if (!id) {
      setBundle(null);
      return;
    }
    try {
      setBundle(await api.getTournament(id));
    } catch {
      setBundle(null);
    }
  }, []);

  useEffect(() => {
    loadBundle(tournamentId);
  }, [tournamentId, loadBundle]);

  const pushHit = useCallback((hit) => {
    feedSeq += 1;
    setFeed((prev) => [{ id: feedSeq, at: new Date(), ...hit }, ...prev].slice(0, 20));
  }, []);

  const handleRegister = useCallback(
    async (rawToken, source) => {
      const token = parseToken(rawToken);
      if (!token) return;
      const now = Date.now();
      if (lastScanRef.current.token === token && now - lastScanRef.current.at < 3500) return;
      if (busyRef.current) return;
      const tid = selectedIdRef.current;
      if (!tid) {
        pushHit({ kind: 'err', name: 'No tournament selected', detail: 'Pick a tournament first', source });
        return;
      }
      lastScanRef.current = { token, at: now };
      busyRef.current = true;
      try {
        const data = await api.scanTournament(tid, { token });
        const theme = getTheme(data.user?.cardTheme);
        pushHit({
          kind: data.alreadyIn ? 'dup' : 'ok',
          name: data.user?.name || 'Fighter',
          detail: data.alreadyIn ? 'Already checked in' : 'Checked in',
          username: data.user?.username,
          deck: data.player?.deck,
          theme,
          source,
        });
        if (data.tournament) setBundle(data.tournament);
      } catch (err) {
        pushHit({ kind: 'err', name: 'Unknown card', detail: err.message, source });
      } finally {
        busyRef.current = false;
      }
    },
    [pushHit]
  );

  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;
    let scanner = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode('qr-reader');
        qrRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => handleRegister(decoded, 'camera'),
          () => {}
        );
      } catch (err) {
        if (!cancelled) {
          setCamError(err?.message || 'Camera is unavailable on this device.');
          setScanning(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const inst = qrRef.current;
      qrRef.current = null;
      if (inst) {
        try {
          if (inst.isScanning) {
            inst.stop().then(() => inst.clear()).catch(() => {});
          } else {
            inst.clear();
          }
        } catch {
          /* ignore */
        }
      }
    };
  }, [scanning, handleRegister]);

  const onManual = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    handleRegister(manual, 'manual');
    setManual('');
  };

  const roster = bundle?.players || [];
  const gated = !isAdmin;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Scan desk</h1>
        <p className="muted">
          {gated
            ? 'Scan your own fighter card to check yourself in.'
            : 'Scan a player’s fighter card to check them into a tournament.'}
        </p>
      </div>

      <div className="card stack" style={{ marginBottom: 18 }}>
        <label className="field">
          <span>Check in to tournament</span>
          <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} disabled={loading}>
            <option value="">{loading ? 'Loading…' : 'Select a tournament…'}</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {STATUS_LABELS[t.status] || t.status} ({t.player_count} players)
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="scan-grid">
        <div className="card stack">
          <h3>Camera</h3>
          <div style={{ position: 'relative' }}>
            <div id="qr-reader" style={{ display: scanning ? 'block' : 'none' }} />
            {!scanning && (
              <div className="scan-placeholder">
                Camera off. Press “Start camera” and point it at a fighter card QR.
              </div>
            )}
          </div>
          {camError && <div className="alert alert-error">{camError}</div>}
          <div className="card-actions">
            {!scanning ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setCamError('');
                  setScanning(true);
                }}
              >
                Start camera
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setScanning(false)}>
                Stop camera
              </button>
            )}
          </div>
          <hr />
          <form className="stack" onSubmit={onManual}>
            <label className="field">
              <span>Or enter a fighter token</span>
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="paste or type the token from a card"
                autoComplete="off"
              />
            </label>
            <button className="btn btn-primary btn-block" type="submit" disabled={!manual.trim()}>
              Check in
            </button>
          </form>
        </div>

        <div className="stack">
          <div className="card stack">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3>Scan activity</h3>
              {feed.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFeed([])}>
                  Clear
                </button>
              )}
            </div>
            {feed.length === 0 ? (
              <p className="muted">No scans yet this session.</p>
            ) : (
              <div className="scan-feed">
                {feed.map((hit) => (
                  <div key={hit.id} className={`scan-hit ${hit.kind}`}>
                    <span className="avatar" style={{ background: hit.theme?.frame || undefined }}>
                      {hit.theme?.emblem || '❓'}
                    </span>
                    <span className="who">
                      <strong>{hit.name}</strong>
                      <small>
                        {hit.username ? `@${hit.username}` : ''}
                        {hit.deck ? ` · 🃏 ${hit.deck}` : ''}
                        {!hit.username && hit.detail ? hit.detail : ''}
                      </small>
                    </span>
                    <span className="scan-tag">
                      {hit.kind === 'ok' ? 'In' : hit.kind === 'dup' ? 'Already' : 'Error'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card stack">
            <h3>
              Roster {bundle ? <span className="muted">· {roster.length} fighters</span> : null}
            </h3>
            {!bundle ? (
              <p className="muted">Select a tournament to see its roster.</p>
            ) : roster.length === 0 ? (
              <p className="muted">No fighters checked in yet.</p>
            ) : (
              <div className="roster-strip">
                {roster.map((p) => (
                  <span key={p.id} className="roster-chip">
                    <span className="dot" />
                    {p.name || p.display_name || p.user_name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {user && (
            <div className="card stack">
              <h3>Your card</h3>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <FighterCard user={user} size="compact" />
              </div>
              <p className="muted" style={{ textAlign: 'center' }}>
                {gated
                  ? 'Only your own card can be checked in from a player account.'
                  : 'Show this at check-in or scan it yourself.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
