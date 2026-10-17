import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Spinner from '../components/Spinner.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import BulkBar, { SelectAllBox, useSelection } from '../components/bulk-ui.jsx';
import { downloadCSV } from '../bulk.js';
import { FORMAT_LABELS, STATUS_LABELS, statusClass, formatDate } from '../format.js';

const FILTERS = [
  { key: 'open', label: 'Open', params: { status: 'registration' } },
  { key: 'active', label: 'In progress', params: { status: 'active' } },
  { key: 'completed', label: 'Completed', params: { status: 'completed' } },
  { key: 'mine', label: 'My tournaments', params: { mine: 'true' } },
  { key: 'all', label: 'All', params: {} },
];

const EXPORT_COLUMNS = [
  { key: 'id', label: 'id' },
  { key: 'name', label: 'name' },
  { key: 'game_name', label: 'game' },
  { key: 'game_slug', label: 'game_slug' },
  { key: 'format', label: 'format' },
  { key: 'status', label: 'status' },
  { key: 'player_count', label: 'players' },
  { key: 'public_slug', label: 'public_slug' },
];

const IMPORT_COLUMNS = [
  { key: 'name', label: 'name', required: true, example: 'Friday Night Vanguard' },
  { key: 'game', label: 'game', aliases: ['game_slug', 'game name'], example: 'cardfight-vanguard' },
  { key: 'format', label: 'format', aliases: ['type'], example: 'swiss' },
  { key: 'bestOf', label: 'best_of', aliases: ['bestof', 'match_length'], example: '3' },
  { key: 'maxPlayers', label: 'max_players', example: '' },
  { key: 'description', label: 'description', example: '' },
];

const FORMAT_ALIASES = {
  swiss: 'swiss',
  'single elimination': 'single_elim',
  single: 'single_elim',
  single_elim: 'single_elim',
  'double elimination': 'double_elim',
  double: 'double_elim',
  double_elim: 'double_elim',
  'round robin': 'round_robin',
  roundrobin: 'round_robin',
  round_robin: 'round_robin',
};

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState('open');
  const [tournaments, setTournaments] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selection = useSelection();

  const load = () => {
    setLoading(true);
    setError('');
    const params = FILTERS.find((f) => f.key === filter)?.params || {};
    return api
      .getTournaments(params)
      .then((data) => setTournaments(data.tournaments))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    if (isAdmin) api.getGames().then((d) => setGames(d.games || [])).catch(() => {});
  }, [isAdmin]);

  const flash = (msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const selectedSet = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]);
  const ids = selection.selectedIds;

  const runBulk = async (payload, message) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.bulkTournaments(payload);
      selection.clear();
      await load();
      flash(message || `Done — ${JSON.stringify(res.summary)}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resolveGameId = (token) => {
    const t = String(token || '').trim().toLowerCase();
    if (!t) return games[0]?.id;
    const bySlug = games.find((g) => g.slug.toLowerCase() === t);
    if (bySlug) return bySlug.id;
    const byName = games.find((g) => g.name.toLowerCase() === t);
    if (byName) return byName.id;
    const partial = games.find((g) => g.slug.toLowerCase().includes(t) || g.name.toLowerCase().includes(t));
    return partial?.id || games[0]?.id;
  };

  const importTournaments = async (rows) => {
    const create = rows.map((r) => {
      const fmt = FORMAT_ALIASES[String(r.format || '').trim().toLowerCase()] || 'swiss';
      return {
        name: r.name,
        gameId: resolveGameId(r.game),
        format: fmt,
        bestOf: r.bestOf ? Number(r.bestOf) : undefined,
        maxPlayers: r.maxPlayers ? Number(r.maxPlayers) : undefined,
        description: r.description || undefined,
      };
    });
    const res = await api.bulkTournaments({ create });
    load();
    return res;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tournaments</h1>
          <p className="muted">Run Swiss, single & double elimination, and round robin events.</p>
        </div>
        <div className="row-actions">
          {isAdmin && (
            <>
              <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>
                Import CSV
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => downloadCSV(`tournaments-${Date.now()}.csv`, tournaments, EXPORT_COLUMNS)}
              >
                Export CSV
              </button>
              <button className={`btn ${selectMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setSelectMode((v) => !v); selection.clear(); }}>
                {selectMode ? 'Done selecting' : 'Select'}
              </button>
              <Link className="btn btn-primary" to="/tournaments/new">
                + New tournament
              </Link>
            </>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="tabs">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isAdmin && selectMode && (
        <div className="toolbar">
          <SelectAllBox rows={tournaments} selection={selection} label="Select all tournaments" />
          <span className="muted small">Select all {tournaments.length}</span>
        </div>
      )}

      <BulkBar count={selection.count} onClear={selection.clear}>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ duplicate: ids }, 'Duplicated selected tournaments.')}>
          Duplicate
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ archive: ids }, 'Archived selected tournaments.')}>
          Archive
        </button>
        <button
          className="btn btn-danger btn-sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${ids.length} tournament(s) and all their results?`)) {
              runBulk({ remove: ids }, 'Deleted selected tournaments.');
            }
          }}
        >
          Delete
        </button>
      </BulkBar>

      {loading ? (
        <Spinner />
      ) : tournaments.length === 0 ? (
        <div className="empty">
          <p>No tournaments here yet.</p>
          {isAdmin && (
            <Link className="btn btn-primary" to="/tournaments/new">
              Create the first one
            </Link>
          )}
        </div>
      ) : (
        <div className="card-grid">
          {tournaments.map((t) => (
            <div key={t.id} className={`t-card-wrap ${selectedSet.has(t.id) ? 'selected' : ''}`}>
              {isAdmin && selectMode && (
                <label className="t-card-check">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(t)}
                    onChange={() => selection.toggle(t)}
                  />
                </label>
              )}
              <Link to={`/tournaments/${t.id}`} className="t-card" onClick={(e) => selectMode && e.preventDefault()}>
                <div className="t-card-top">
                  <span className={statusClass(t.status)}>{STATUS_LABELS[t.status] || t.status}</span>
                  <span className="chip">{FORMAT_LABELS[t.format] || t.format}</span>
                </div>
                <h3>{t.name}</h3>
                <p className="muted small">{t.game_name}</p>
                <div className="t-card-foot">
                  <span>
                    <strong>{t.player_count}</strong> players
                  </span>
                  {t.status === 'active' && t.current_round ? (
                    <span>Round {t.current_round}</span>
                  ) : (
                    <span className="muted">{formatDate(t.created_at)}</span>
                  )}
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {importOpen && (
        <ImportDialog
          title="Import tournaments"
          help="Create many tournaments at once. The game column accepts a slug or name (e.g. cardfight-vanguard)."
          columns={IMPORT_COLUMNS}
          onSubmit={importTournaments}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}
