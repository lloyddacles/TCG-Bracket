import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Spinner from '../components/Spinner.jsx';
import Modal from '../components/Modal.jsx';
import Bracket from '../components/Bracket.jsx';
import StandingsTable from '../components/StandingsTable.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import BulkBar, { RowCheck, SelectAllBox, useSelection } from '../components/bulk-ui.jsx';
import { downloadCSV } from '../bulk.js';
import { useLive } from '../live.js';
import { FORMAT_LABELS, STATUS_LABELS, TIME_RULE_LABELS, statusClass, formatDate } from '../format.js';

const TABS = ['Overview', 'Players', 'Seeding', 'Rounds', 'Bracket', 'Standings', 'History', 'Settings'];

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');
  const [notice, setNotice] = useState('');
  const [syncedAt, setSyncedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getTournament(id);
      setBundle(data);
      setSyncedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the bracket in sync with changes made by anyone else.
  useLive({ path: `/api/tournaments/${id}/events`, onEvent: load });

  const apply = (data) => {
    const next = data && data.bundle ? data.bundle : data;
    if (next && next.tournament && next.matches) setBundle(next);
    else load();
  };

  const guard = async (fn) => {
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  const flash = (msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const playersMap = useMemo(() => {
    const m = new Map();
    for (const p of bundle?.players || []) m.set(p.id, p);
    return m;
  }, [bundle]);

  if (loading) return <Spinner full />;
  if (!bundle) return <div className="page"><div className="alert alert-error">{error || 'Not found'}</div></div>;

  const { tournament: t, game, players, matches, standings, champion } = bundle;
  const myPlayer = players.find((p) => p.user_id === user.id);
  const isElim = t.format === 'single_elim' || t.format === 'double_elim';
  const tabs = isElim ? TABS : TABS.filter((x) => x !== 'Bracket');

  return (
    <div className="page">
      <div className="page-head">
        <div className="detail-title">
          <Link to="/" className="back-link">
            ← Tournaments
          </Link>
          <h1>{t.name}</h1>
          <div className="detail-badges">
            <span className={statusClass(t.status)}>{STATUS_LABELS[t.status] || t.status}</span>
            <span className="chip">{game?.name}</span>
            <span className="chip">{FORMAT_LABELS[t.format]}</span>
            {t.status === 'active' && <span className="chip">Round {t.current_round}/{t.total_rounds}</span>}
          </div>
        </div>
        <div className="row-actions">
          <span className="live-badge" title="Refreshes automatically when anything changes">
            <span className="live-dot" />
            Live{syncedAt ? ` · ${new Date(syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
          </span>
          <button className="btn btn-ghost" onClick={load}>
            Refresh
          </button>
          <Link className="btn btn-ghost" to={`/tournaments/${id}/print`}>
            Print
          </Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="tabs">
        {tabs.map((x) => (
          <button key={x} type="button" className={`tab ${tab === x ? 'active' : ''}`} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <Overview
          t={t}
          champion={champion}
          myPlayer={myPlayer}
          isAdmin={isAdmin}
          onRegister={() =>
            guard(async () => apply(await api.registerForTournament(t.id)))
          }
          onUnregister={() =>
            guard(async () => apply(await api.unregisterFromTournament(t.id)))
          }
          onStart={() =>
            guard(async () => {
              apply(await api.startTournament(t.id));
              setTab('Rounds');
            })
          }
          onToggleRegistration={() =>
            guard(async () => {
              const r = await api.updateTournament(t.id, { registrationOpen: !t.registration_open });
              if (r && r.tournament) await load();
            })
          }
          onDelete={() => guard(async () => {
            if (!window.confirm('Delete this tournament and all its results?')) return;
            await api.deleteTournament(t.id);
            navigate('/');
          })}
          onCopy={() => {
            navigator.clipboard?.writeText(`${window.location.origin}/t/${t.public_slug}`);
            flash('Public link copied');
          }}
          playerCount={players.filter((p) => !p.is_bye).length}
        />
      )}

      {tab === 'Players' && (
        <PlayersTab
          t={t}
          players={players}
          myPlayer={myPlayer}
          user={user}
          isAdmin={isAdmin}
          onRegister={() =>
            guard(async () => apply(await api.registerForTournament(t.id)))
          }
          onUnregister={() =>
            guard(async () => apply(await api.unregisterFromTournament(t.id)))
          }
          onAdd={(username) => guard(async () => apply(await api.addPlayer(t.id, username)))}
          onUpdatePlayer={(playerId, data) =>
            guard(async () => apply(await api.updatePlayer(t.id, playerId, data)))
          }
          onRemove={(playerId) =>
            guard(async () => apply(await api.removePlayer(t.id, playerId)))
          }
          onBulkPlayers={(payload) =>
            guard(async () => {
              const r = await api.bulkPlayers(t.id, payload);
              apply(r);
              return r;
            })
          }
        />
      )}

      {tab === 'Seeding' && (
        <SeedingTab
          t={t}
          players={players}
          isAdmin={isAdmin}
          onSave={(playerIds) => guard(async () => apply(await api.setTournamentSeeds(t.id, { playerIds })))}
          onMode={(mode) => guard(async () => apply(await api.setTournamentSeeds(t.id, { mode })))}
        />
      )}

      {tab === 'Rounds' && (
        <RoundsTab
          t={t}
          matches={matches}
          playersMap={playersMap}
          user={user}
          isAdmin={isAdmin}
          onApply={apply}
          onGuard={guard}
        />
      )}

      {tab === 'Bracket' && <Bracket matches={matches} players={players} format={t.format} />}

      {tab === 'Standings' && (
        <div className="card">
          <h3>Standings</h3>
          <StandingsTable standings={standings} linkProfiles />
        </div>
      )}

      {tab === 'History' && <HistoryTab id={t.id} isAdmin={isAdmin} refreshKey={syncedAt} />}

      {tab === 'Settings' && (
        isAdmin ? (
          <SettingsTab t={t} onSaved={load} onError={setError} />
        ) : (
          <p className="muted">Only organizers can change settings.</p>
        )
      )}
    </div>
  );
}

/* ------------------------------- Overview -------------------------------- */

function Overview({ t, champion, myPlayer, isAdmin, playerCount, onRegister, onUnregister, onStart, onToggleRegistration, onDelete, onCopy }) {
  const canStart = isAdmin && ['registration', 'draft'].includes(t.status);
  return (
    <div className="grid-2">
      <div className="card stack">
        <h3>Details</h3>
        {t.description && <p>{t.description}</p>}
        <dl className="kv">
          <dt>Format</dt>
          <dd>{FORMAT_LABELS[t.format]}</dd>
          <dt>Match length</dt>
          <dd>Best of {t.best_of}</dd>
          <dt>Time rule</dt>
          <dd>{TIME_RULE_LABELS[t.time_rule] || t.time_rule}</dd>
          <dt>Draws</dt>
          <dd>{t.allow_draws ? 'Allowed' : 'Not allowed'}</dd>
          <dt>Points</dt>
          <dd>Win {t.points_win} · Draw {t.points_draw} · Loss {t.points_loss}</dd>
          <dt>Rounds</dt>
          <dd>{t.total_rounds || t.rounds_override || '—'}</dd>
          <dt>Players</dt>
          <dd>{playerCount}{t.max_players ? ` / ${t.max_players}` : ''}</dd>
          <dt>Created</dt>
          <dd>{formatDate(t.created_at)}</dd>
        </dl>

        {champion && (
          <div className="champion-banner">
            <span>🏆</span>
            <div>
              <strong>Champion</strong>
              <div>{champion.name}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card stack">
        <h3>Actions</h3>

        {t.status === 'registration' && (
          <>
            {!myPlayer && (
              <button className="btn btn-primary" onClick={onRegister}>
                Register for this tournament
              </button>
            )}
            {myPlayer && (
              <button className="btn btn-ghost" onClick={onUnregister}>
                Cancel my registration
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-ghost" onClick={onToggleRegistration}>
                {t.registration_open ? 'Close registration' : 'Open registration'}
              </button>
            )}
          </>
        )}

        {canStart && (
          <>
            <button className="btn btn-primary" onClick={onStart}>
              Start tournament
            </button>
            <p className="muted small">Pairings are generated from the registered players.</p>
          </>
        )}

        {t.status === 'active' && (
          <p className="muted">This tournament is in progress. Report results in the Rounds tab.</p>
        )}
        {t.status === 'completed' && <p className="muted">This tournament has finished.</p>}

        <div className="share-row">
          <input readOnly value={`${window.location.origin}/t/${t.public_slug}`} />
          <button className="btn btn-ghost btn-sm" onClick={onCopy}>
            Copy
          </button>
        </div>
        <p className="muted small">Share this read-only link so anyone can follow along.</p>

        {isAdmin && (
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            Delete tournament
          </button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Players -------------------------------- */

function PlayersTab({ t, players, myPlayer, user, isAdmin, onRegister, onUnregister, onAdd, onRemove, onBulkPlayers }) {
  const [addName, setAddName] = useState('');
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const selection = useSelection();

  const real = players.filter((p) => !p.is_bye);
  const canEdit = isAdmin && t.status !== 'completed';

  // Admins can pick an existing account instead of typing a username.
  const [registeredUsers, setRegisteredUsers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .getUsers()
      .then((d) => setRegisteredUsers(d.users || []))
      .catch(() => {});
  }, [isAdmin]);

  const inTournament = useMemo(() => new Set(real.map((p) => Number(p.user_id))), [real]);
  const addableUsers = useMemo(
    () =>
      registeredUsers
        .filter((u) => Number(u.active) !== 0 && !inTournament.has(Number(u.id)))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [registeredUsers, inTournament]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return real;
    return real.filter(
      (p) => (p.name || '').toLowerCase().includes(q) || (p.deck || '').toLowerCase().includes(q)
    );
  }, [real, query]);

  const selectedSet = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]);

  const setDraft = (p, key, value) =>
    setDrafts((d) => ({ ...d, [p.id]: { ...(d[p.id] || {}), [key]: value } }));

  const draftCount = Object.keys(drafts).length;

  const saveDrafts = async () => {
    const update = Object.entries(drafts).map(([id, patch]) => ({ id: Number(id), ...patch }));
    if (!update.length) return;
    setBusy(true);
    await onBulkPlayers({ update });
    setDrafts({});
    setBusy(false);
  };

  const runBulk = async (payload) => {
    setBusy(true);
    await onBulkPlayers(payload);
    selection.clear();
    setBusy(false);
  };

  const ids = selection.selectedIds;

  const IMPORT_COLUMNS = [
    { key: 'username', label: 'username', aliases: ['user'], required: true, example: 'player1' },
    { key: 'displayName', label: 'display_name', aliases: ['name', 'display'], example: '' },
    { key: 'deck', label: 'deck', aliases: ['nation', 'collab'], example: 'Dragon Empire — Dragonic Overlord' },
    { key: 'seed', label: 'seed', example: '1' },
  ];
  const EXPORT_COLUMNS = [
    { key: 'seed', label: 'seed' },
    { key: 'name', label: 'player' },
    { key: 'username', label: 'username' },
    { key: 'deck', label: 'deck' },
    { key: 'status', label: 'status', value: (p) => (p.dropped ? 'dropped' : p.eliminated ? 'eliminated' : 'in') },
  ];

  const importPlayers = (rows) =>
    onBulkPlayers({
      add: rows.map((r) => ({
        username: r.username,
        displayName: r.displayName || undefined,
        deck: r.deck || undefined,
        seed: r.seed ? Number(r.seed) : undefined,
      })),
    });

  return (
    <div className="card stack">
      <div className="spread">
        <h3>Players ({real.length})</h3>
        <div className="row-actions">
          {isAdmin && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>
                Import CSV
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => downloadCSV(`roster-${t.id}-${Date.now()}.csv`, real, EXPORT_COLUMNS)}
              >
                Export CSV
              </button>
            </>
          )}
          {t.status === 'registration' && !myPlayer && (
            <button className="btn btn-primary btn-sm" onClick={onRegister}>
              Register me
            </button>
          )}
          {t.status === 'registration' && myPlayer && (
            <button className="btn btn-ghost btn-sm" onClick={onUnregister}>
              Cancel my registration
            </button>
          )}
        </div>
      </div>

      {isAdmin && (t.status === 'registration' || t.status === 'active') && (
        <div className="add-player">
          <select
            className="add-player-select"
            value=""
            disabled={addableUsers.length === 0}
            onChange={(e) => {
              const username = e.target.value;
              if (username) onAdd(username);
            }}
          >
            <option value="">
              {addableUsers.length > 0
                ? `Add a registered player… (${addableUsers.length} available)`
                : real.length > 0
                  ? 'All registered players are already in'
                  : 'Add a registered player…'}
            </option>
            {addableUsers.map((u) => (
              <option key={u.id} value={u.username}>
                {u.name} (@{u.username}){u.role === 'admin' ? ' · organizer' : ''}
              </option>
            ))}
          </select>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (addName.trim()) onAdd(addName.trim());
              setAddName('');
            }}
          >
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="or add by username" />
            <button className="btn btn-ghost">Add player</button>
          </form>
        </div>
      )}

      {real.length > 2 && (
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search player or deck…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="muted small">{filtered.length} shown</span>
        </div>
      )}

      <BulkBar count={selection.count} onClear={selection.clear}>
        {canEdit && (
          <>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ update: ids.map((id) => ({ id, dropped: false })), })}>
              Reinstate
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ update: ids.map((id) => ({ id, dropped: true })), })}>
              Mark dropped
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove ${ids.length} player(s) from this tournament?`)) {
                  runBulk({ remove: ids });
                }
              }}
            >
              {t.status === 'registration' ? 'Remove' : 'Drop'}
            </button>
          </>
        )}
      </BulkBar>

      {draftCount > 0 && (
        <div className="bulk-bar edit-bar">
          <strong>{draftCount} unsaved edit(s)</strong>
          <div className="bulk-actions">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveDrafts}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDrafts({})}>
              Discard
            </button>
          </div>
        </div>
      )}

      {real.length === 0 ? (
        <p className="muted">No players have registered yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="check-col">
                  <SelectAllBox rows={filtered} selection={selection} />
                </th>
                <th className="seed-col">Seed</th>
                <th>Player</th>
                <th>Deck / Nation</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const draft = drafts[p.id] || {};
                const deckVal = draft.deck !== undefined ? draft.deck : p.deck || '';
                const seedVal = draft.seed !== undefined ? draft.seed : p.seed ?? '';
                return (
                  <tr key={p.id} className={`${p.dropped ? 'row-dropped' : ''} ${selectedSet.has(p.id) ? 'row-selected' : ''}`}>
                    <td className="check-col">
                      <RowCheck row={p} selection={selection} />
                    </td>
                    <td className="seed-col">
                      {canEdit ? (
                        <input
                          className="cell-input seed-input"
                          type="number"
                          min={1}
                          value={seedVal}
                          onChange={(e) => setDraft(p, 'seed', e.target.value ? Number(e.target.value) : null)}
                        />
                      ) : (
                        p.seed || '—'
                      )}
                    </td>
                    <td>
                      {p.user_id ? (
                        <Link className="player-link" to={`/players/${p.user_id}`}>
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <input
                          className="cell-input"
                          value={deckVal}
                          placeholder="—"
                          onChange={(e) => setDraft(p, 'deck', e.target.value)}
                        />
                      ) : (
                        p.deck || <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {draft.dropped === true || p.dropped ? (
                        <span className="tag tag-muted">dropped</span>
                      ) : p.eliminated ? (
                        <span className="tag tag-muted">eliminated</span>
                      ) : (
                        <span className="tag tag-ok">in</span>
                      )}
                    </td>
                    <td className="row-actions">
                      {(isAdmin || p.user_id === user.id) && t.status !== 'completed' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                      )}
                      {isAdmin && t.status !== 'completed' && (
                        <button className="btn btn-danger btn-sm" onClick={() => onRemove(p.id)}>
                          {t.status === 'registration' ? 'Remove' : 'Drop'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <PlayerEditModal
          player={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            onBulkPlayers({ update: [{ id: editing.id, ...data }] });
            setEditing(null);
          }}
        />
      )}

      {importOpen && (
        <ImportDialog
          title={`Import players — ${t.name}`}
          help="Paste or upload a CSV of players to add to this tournament. Rows for existing players will update their deck/seed."
          columns={IMPORT_COLUMNS}
          onSubmit={importPlayers}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function PlayerEditModal({ player, onClose, onSave }) {
  const [deck, setDeck] = useState(player.deck || '');
  const [displayName, setDisplayName] = useState(player.display_name || '');
  return (
    <Modal title={`Edit ${player.name}`} onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Display name (optional)</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={player.user_name} />
        </label>
        <label className="field">
          <span>Deck / Nation</span>
          <input value={deck} onChange={(e) => setDeck(e.target.value)} placeholder="e.g. Dragon Empire — Dragonic Overlord" />
        </label>
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave({ deck, displayName })}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------- Rounds --------------------------------- */

/* ------------------------------ Seeding tab ------------------------------- */

function seedOrderFrom(players) {
  const key = (p) => (p.seed == null ? Number.MAX_SAFE_INTEGER : Number(p.seed));
  return [...players.filter((p) => !Number(p.is_bye))]
    .sort((a, b) => key(a) - key(b) || Number(a.id) - Number(b.id))
    .map((p) => Number(p.id));
}

function SeedingTab({ t, players, isAdmin, onSave, onMode }) {
  const real = players.filter((p) => !Number(p.is_bye));
  const seedable = isAdmin && ['draft', 'registration'].includes(t.status);
  const [order, setOrder] = useState(() => seedOrderFrom(players));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Follow the server unless the organizer has unsaved reordering in progress.
  useEffect(() => {
    if (!dirty) setOrder(seedOrderFrom(players));
  }, [players, dirty]);

  const nameById = useMemo(() => {
    const map = new Map();
    for (const p of real) map.set(Number(p.id), p.name || `Player ${p.id}`);
    return map;
  }, [real]);

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirty(true);
  };

  // onSave/onMode are already guarded by the parent; they resolve to null on
  // error, so keep the pending reorder in that case.
  const run = async (fn) => {
    setBusy(true);
    const res = await fn();
    if (res !== null) setDirty(false);
    setBusy(false);
  };

  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <div>
            <h3>Bracket seeding</h3>
            <p className="muted small">
              Seeds decide bracket placement for elimination formats and break ties in Swiss. Change them
              before starting — once the tournament is running they are locked.
            </p>
          </div>
          {seedable && (
            <div className="row-actions">
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => onMode('random'))}>
                Shuffle
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => run(() => onMode('registration'))}
              >
                By registration
              </button>
            </div>
          )}
        </div>

        {dirty && (
          <div className="bulk-bar edit-bar">
            <strong>Unsaved seed order</strong>
            <div className="bulk-actions">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => run(() => onSave(order))}
              >
                {busy ? 'Saving…' : 'Save seed order'}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDirty(false)}>
                Discard
              </button>
            </div>
          </div>
        )}

        <ol className="seed-list">
          {order.map((pid, index) => (
            <li key={pid} className="seed-row">
              <span className="seed-rank">{index + 1}</span>
              <span className="seed-name">{nameById.get(pid) || `Player ${pid}`}</span>
              <span className="muted small">
                {real.find((p) => Number(p.id) === Number(pid))?.deck || ''}
              </span>
              {seedable && (
                <span className="seed-move">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Move up"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Move down"
                    disabled={busy || index === order.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>

        {!seedable && (
          <p className="muted small">
            {isAdmin ? 'Seeding is locked once the tournament has started.' : 'Seeds are managed by the organizer.'}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ History tab ------------------------------ */

const ACTION_LABELS = {
  started: 'Started',
  completed: 'Completed',
  reported: 'Reported',
  approved: 'Approved',
  result_set: 'Result',
  reset: 'Reset',
  bye: 'Bye',
  round_advanced: 'Round',
  gf_reset: 'GF reset',
  seeds_set: 'Seeding',
  registered: 'Registered',
  unregistered: 'Unregistered',
  checked_in: 'Check-in',
  player_added: 'Roster',
  player_removed: 'Roster',
};

function formatEventTime(iso) {
  if (!iso) return '';
  // SQLite's datetime('now') is UTC without a zone suffix.
  const date = new Date(`${String(iso).replace(' ', 'T')}${String(iso).includes('T') ? '' : 'Z'}`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function HistoryTab({ id, isAdmin, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const data = await api.getTournamentHistory(id);
      setEvents(data.events || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshKey]);

  return (
    <div className="card stack">
      <div className="spread">
        <div>
          <h3>Match history &amp; audit log</h3>
          <p className="muted small">Every recorded action on this tournament, newest first.</p>
        </div>
        {!isAdmin && <span className="muted small">Organizer identity is hidden</span>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <Spinner />}

      {!loading && !error && events.length === 0 && (
        <p className="muted">No activity recorded yet.</p>
      )}

      {events.length > 0 && (
        <ul className="event-list">
          {events.map((e) => (
            <li key={e.id} className="event-row">
              <span className={`event-action action-${e.action}`}>
                {ACTION_LABELS[e.action] || e.action}
              </span>
              <span className="event-summary">{e.summary || '—'}</span>
              <span className="event-meta">
                {e.round != null && <span className="tag">R{e.round}</span>}
                {isAdmin && e.actor && <span className="event-actor">{e.actor}</span>}
                <time className="muted small" dateTime={e.createdAt}>
                  {formatEventTime(e.createdAt)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoundsTab({ t, matches, playersMap, user, isAdmin, onApply, onGuard }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const [round, setRound] = useState(t.current_round || rounds[0] || 1);
  const [scoreFor, setScoreFor] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (t.current_round && !rounds.includes(round)) setRound(t.current_round);
  }, [t.current_round, round, rounds]);

  const roundMatches = matches.filter((m) => m.round === round);
  const brackets = [...new Set(roundMatches.map((m) => m.bracket))];
  const playable = roundMatches.filter(
    (m) => m.player1_id && m.player2_id && !Number(m.player1_is_bye) && !Number(m.player2_is_bye)
  );
  const reportedCount = matches.filter((m) => m.status === 'reported').length;

  const exportResults = () =>
    downloadCSV(`results-${t.id}-r${round}-${Date.now()}.csv`, playable, [
      { key: 'id', label: 'match_id' },
      { key: 'p1', label: 'player1', value: (m) => playersMap.get(m.player1_id)?.name || '' },
      { key: 'p2', label: 'player2', value: (m) => playersMap.get(m.player2_id)?.name || '' },
      { key: 'score1', label: 'score1' },
      { key: 'score2', label: 'score2' },
    ]);

  const importResults = (rows) => {
    const results = rows
      .map((r) => ({
        id: Number(r.match_id || r.id),
        score1: r.score1 !== undefined && r.score1 !== '' ? Number(r.score1) : undefined,
        score2: r.score2 !== undefined && r.score2 !== '' ? Number(r.score2) : undefined,
      }))
      .filter((r) => r.id);
    return onGuard(async () => {
      const res = await api.bulkMatches(t.id, { results });
      onApply(res);
      return res;
    });
  };

  const approveAll = () =>
    onGuard(async () => onApply(await api.bulkMatches(t.id, { approveAll: true })));

  return (
    <div className="stack">
      <div className="spread">
        <div className="round-picker">
          {rounds.map((r) => (
            <button key={r} type="button" className={`tab ${round === r ? 'active' : ''}`} onClick={() => setRound(r)}>
              Round {r}
            </button>
          ))}
        </div>
        {isAdmin && t.status === 'active' && (
          <div className="row-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setBulkMode((v) => !v)}>
              {bulkMode ? 'Single entry' : 'Bulk entry'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)}>
              Import results
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportResults}>
              Export results
            </button>
            {reportedCount > 0 && (
              <button className="btn btn-primary btn-sm" onClick={approveAll}>
                Approve all ({reportedCount})
              </button>
            )}
          </div>
        )}
      </div>

      {roundMatches.length === 0 && <p className="muted">No matches in this round.</p>}

      {bulkMode && isAdmin && t.status === 'active' ? (
        <BulkResultGrid
          matches={roundMatches}
          playersMap={playersMap}
          bestOf={t.best_of}
          onSave={(results) => onGuard(async () => onApply(await api.bulkMatches(t.id, { results })))}
        />
      ) : (
        brackets.map((b) => (
          <div key={b} className="card">
            {brackets.length > 1 && <h4 className="bracket-section-title">{bracketLabel(b)}</h4>}
            <div className="match-list">
              {roundMatches
                .filter((m) => m.bracket === b)
                .map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    bestOf={t.best_of}
                    allowDraws={!!t.allow_draws}
                    playersMap={playersMap}
                    user={user}
                    isAdmin={isAdmin}
                    tournamentActive={t.status === 'active'}
                    onReport={() => setScoreFor({ match: m, mode: 'report' })}
                    onSetResult={() => setScoreFor({ match: m, mode: 'admin' })}
                    onApprove={() => onGuard(async () => onApply(await api.approveMatch(m.id)))}
                    onReset={() => onGuard(async () => onApply(await api.resetMatch(m.id)))}
                  />
                ))}
            </div>
          </div>
        ))
      )}

      {scoreFor && (
        <ScoreModal
          match={scoreFor.match}
          mode={scoreFor.mode}
          bestOf={t.best_of}
          allowDraws={!!t.allow_draws}
          playersMap={playersMap}
          onClose={() => setScoreFor(null)}
          onSubmit={(scores) => {
            const m = scoreFor.match;
            onGuard(async () => {
              if (scoreFor.mode === 'report') onApply(await api.reportMatch(m.id, scores));
              else onApply(await api.setMatchResult(m.id, scores));
            });
            setScoreFor(null);
          }}
        />
      )}

      {importOpen && (
        <ImportDialog
          title="Import results"
          help="Match rows by match_id. Export a round first to get the ids, edit the scores, then import back."
          columns={[
            { key: 'match_id', label: 'match_id', aliases: ['id', 'match'], required: true, example: '12' },
            { key: 'score1', label: 'score1', example: '2' },
            { key: 'score2', label: 'score2', example: '0' },
          ]}
          onSubmit={importResults}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function BulkResultGrid({ matches, playersMap, bestOf, onSave }) {
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const cap = Math.ceil(bestOf / 2);
  const name = (id) => playersMap.get(id)?.name || `#${id}`;

  const setVal = (m, key, val) => setDrafts((d) => ({ ...d, [m.id]: { ...(d[m.id] || {}), [key]: val } }));
  const count = Object.keys(drafts).length;

  const save = async () => {
    const results = Object.entries(drafts).map(([id, patch]) => ({ id: Number(id), ...patch }));
    setBusy(true);
    await onSave(results);
    setDrafts({});
    setBusy(false);
  };

  return (
    <div className="card stack">
      {count > 0 && (
        <div className="bulk-bar edit-bar">
          <strong>{count} unsaved result(s)</strong>
          <div className="bulk-actions">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save all results'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setDrafts({})}>
              Discard
            </button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="table result-grid">
          <thead>
            <tr>
              <th>#</th>
              <th>Player 1</th>
              <th className="score-col">1</th>
              <th className="score-col">2</th>
              <th>Player 2</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m, i) => {
              const bye = Number(m.player1_is_bye) || Number(m.player2_is_bye);
              const ready = m.player1_id && m.player2_id && !bye;
              const d = drafts[m.id] || {};
              const s1 = d.score1 !== undefined ? d.score1 : m.score1 ?? '';
              const s2 = d.score2 !== undefined ? d.score2 : m.score2 ?? '';
              return (
                <tr key={m.id}>
                  <td className="muted">{i + 1}</td>
                  <td>{m.player1_id ? name(m.player1_id) : <span className="muted">TBD</span>}</td>
                  <td className="score-col">
                    {ready ? (
                      <input
                        className="cell-input score-input"
                        type="number"
                        min={0}
                        max={cap}
                        value={s1}
                        onChange={(e) => setVal(m, 'score1', e.target.value === '' ? null : Number(e.target.value))}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="score-col">
                    {ready ? (
                      <input
                        className="cell-input score-input"
                        type="number"
                        min={0}
                        max={cap}
                        value={s2}
                        onChange={(e) => setVal(m, 'score2', e.target.value === '' ? null : Number(e.target.value))}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{m.player2_id ? name(m.player2_id) : <span className="muted">TBD</span>}</td>
                  <td>
                    <MatchStatus match={m} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Type the game scores, then “Save all results”. Winners advance automatically. Best of {bestOf} — first to {cap}.
      </p>
    </div>
  );
}

function bracketLabel(b) {
  return { main: 'Winners Bracket', losers: 'Losers Bracket', grand_final: 'Grand Final', swiss: 'Swiss', round_robin: 'Round Robin' }[b] || b;
}

function MatchRow({ match, playersMap, user, isAdmin, tournamentActive, onReport, onSetResult, onApprove, onReset }) {
  const name = (id, byFlag) => (byFlag ? 'BYE' : id == null ? 'TBD' : playersMap.get(id)?.name || `#${id}`);
  const p1 = name(match.player1_id, match.player1_is_bye);
  const p2 = name(match.player2_id, match.player2_is_bye);
  const isBye = Number(match.player1_is_bye) || Number(match.player2_is_bye);
  const isParticipant =
    user &&
    [match.player1_id, match.player2_id].some(
      (pid) => pid != null && playersMap.get(pid)?.user_id === user.id
    );
  const ready = match.player1_id != null && match.player2_id != null && !isBye;
  const win1 = match.winner_id && Number(match.winner_id) === Number(match.player1_id);
  const win2 = match.winner_id && Number(match.winner_id) === Number(match.player2_id);

  return (
    <div className={`match-row ${match.status}`}>
      <div className="match-players">
        <div className={`match-player ${win1 ? 'winner' : ''}`}>
          <span>{p1}</span>
          <span className="match-score">{match.score1 ?? '—'}</span>
        </div>
        <div className={`match-player ${win2 ? 'winner' : ''}`}>
          <span>{p2}</span>
          <span className="match-score">{match.score2 ?? '—'}</span>
        </div>
      </div>
      <div className="match-status">
        <MatchStatus match={match} />
      </div>
      <div className="match-actions">
        {tournamentActive && ready && match.status === 'pending' && isParticipant && (
          <button className="btn btn-primary btn-sm" onClick={onReport}>
            Report score
          </button>
        )}
        {tournamentActive && ready && match.status !== 'approved' && isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={onSetResult}>
            Set result
          </button>
        )}
        {tournamentActive && match.status === 'reported' && isAdmin && (
          <>
            <button className="btn btn-primary btn-sm" onClick={onApprove}>
              Approve
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onReset}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function MatchStatus({ match }) {
  if (Number(match.is_bye)) return <span className="tag tag-muted">bye</span>;
  if (match.status === 'approved') {
    if (match.is_draw) return <span className="tag tag-warn">draw</span>;
    return <span className="tag tag-ok">final</span>;
  }
  if (match.status === 'reported') return <span className="tag">awaiting approval</span>;
  if (match.status === 'void') return <span className="tag tag-muted">—</span>;
  if (match.status === 'waiting') return <span className="tag tag-muted">pending</span>;
  if (match.player1_id == null || match.player2_id == null) return <span className="tag tag-muted">pending</span>;
  return <span className="tag">ready</span>;
}

function ScoreModal({ match, mode, bestOf, allowDraws, playersMap, onClose, onSubmit }) {
  const cap = Math.ceil(bestOf / 2);
  const name = (id) => playersMap.get(id)?.name || `#${id}`;
  const [s1, setS1] = useState(match.score1 ?? '');
  const [s2, setS2] = useState(match.score2 ?? '');

  const quick =
    bestOf === 1
      ? [[1, 0], [0, 1]]
      : bestOf === 5
        ? [[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]]
        : [[2, 0], [2, 1], [1, 2], [0, 2]];

  return (
    <Modal
      title={`${mode === 'report' ? 'Report score' : 'Set result'} — ${name(match.player1_id)} vs ${name(match.player2_id)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onSubmit({ score1: Number(s1), score2: Number(s2) })}
            disabled={s1 === '' || s2 === ''}
          >
            Save result
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="score-grid">
          <label className="field">
            <span>{name(match.player1_id)} games</span>
            <input type="number" min={0} max={cap} value={s1} onChange={(e) => setS1(e.target.value)} />
          </label>
          <label className="field">
            <span>{name(match.player2_id)} games</span>
            <input type="number" min={0} max={cap} value={s2} onChange={(e) => setS2(e.target.value)} />
          </label>
        </div>
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
          {allowDraws && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setS1(bestOf === 1 ? 0 : 1);
                setS2(bestOf === 1 ? 0 : 1);
              }}
            >
              Draw
            </button>
          )}
        </div>
        <p className="muted small">
          Best of {bestOf}: first to {cap} game win(s). {allowDraws ? 'Draws are allowed.' : 'Draws are not allowed.'}
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------- Settings -------------------------------- */

function SettingsTab({ t, onSaved, onError }) {
  const [form, setForm] = useState({
    name: t.name,
    description: t.description || '',
    bestOf: t.best_of,
    allowDraws: !!t.allow_draws,
    timeRule: t.time_rule,
    pointsWin: t.points_win,
    pointsDraw: t.points_draw,
    pointsLoss: t.points_loss,
    roundsOverride: t.rounds_override || '',
    maxPlayers: t.max_players || '',
    registrationOpen: !!t.registration_open,
    viewPublic: !!t.view_public,
  });
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError('');
    try {
      await api.updateTournament(t.id, {
        ...form,
        bestOf: Number(form.bestOf),
        pointsWin: Number(form.pointsWin),
        pointsDraw: Number(form.pointsDraw),
        pointsLoss: Number(form.pointsLoss),
        roundsOverride: form.roundsOverride ? Number(form.roundsOverride) : null,
        maxPlayers: form.maxPlayers ? Number(form.maxPlayers) : null,
      });
      onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const locked = t.status === 'active' || t.status === 'completed';

  return (
    <form className="card stack" onSubmit={save}>
      <h3>Settings</h3>
      <label className="field">
        <span>Name</span>
        <input value={form.name} onChange={upd('name')} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={2} value={form.description} onChange={upd('description')} />
      </label>
      <div className="grid-3">
        <label className="field">
          <span>Match length</span>
          <select value={form.bestOf} onChange={upd('bestOf')}>
            <option value={1}>Best of 1</option>
            <option value={3}>Best of 3</option>
            <option value={5}>Best of 5</option>
          </select>
        </label>
        <label className="field">
          <span>Time rule</span>
          <select value={form.timeRule} onChange={upd('timeRule')}>
            <option value="sudden_death">Sudden death</option>
            <option value="extra_turns">Extra turns</option>
            <option value="draw">Draw</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="field">
          <span>Max players</span>
          <input type="number" min={2} value={form.maxPlayers} onChange={upd('maxPlayers')} placeholder="No limit" />
        </label>
      </div>
      <fieldset className="fieldset">
        <legend>Match points</legend>
        <div className="grid-3">
          <label className="field">
            <span>Win</span>
            <input type="number" min={0} value={form.pointsWin} onChange={upd('pointsWin')} />
          </label>
          <label className="field">
            <span>Draw</span>
            <input type="number" min={0} value={form.pointsDraw} onChange={upd('pointsDraw')} />
          </label>
          <label className="field">
            <span>Loss</span>
            <input type="number" min={0} value={form.pointsLoss} onChange={upd('pointsLoss')} />
          </label>
        </div>
      </fieldset>
      {!locked && (
        <label className="checkbox">
          <input type="checkbox" checked={form.allowDraws} onChange={upd('allowDraws')} />
          <span>Allow draws</span>
        </label>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={form.registrationOpen} onChange={upd('registrationOpen')} disabled={locked} />
        <span>Registration open</span>
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.viewPublic} onChange={upd('viewPublic')} />
        <span>Publicly viewable bracket</span>
      </label>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </form>
  );
}
