import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import BulkBar, { RowCheck, SelectAllBox, useSelection } from '../components/bulk-ui.jsx';
import { downloadCSV } from '../bulk.js';

const IMPORT_COLUMNS = [
  { key: 'username', label: 'username', required: true, example: 'player13' },
  { key: 'name', label: 'name', required: true, example: 'New Duelist' },
  { key: 'role', label: 'role', aliases: ['type'], example: 'player' },
  { key: 'password', label: 'password', aliases: ['pass'], example: '(blank = auto)' },
];

const EXPORT_COLUMNS = [
  { key: 'name', label: 'name' },
  { key: 'username', label: 'username' },
  { key: 'role', label: 'role' },
  { key: 'active', label: 'active', value: (u) => (u.active ? 'active' : 'disabled') },
  { key: 'qrToken', label: 'qr_token' },
  { key: 'cardTheme', label: 'card_theme' },
];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [issued, setIssued] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const selection = useSelection();

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  }, [users, query]);

  const selectedSet = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]);

  const onDelete = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await api.deleteUser(u.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { active: u.active ? 0 : 1 });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setRole = async (u, role) => {
    try {
      await api.updateUser(u.id, { role });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const runBulk = async (payload, message) => {
    setError('');
    setBusy(true);
    try {
      const res = await api.bulkUsers(payload);
      selection.clear();
      await load();
      flash(message || `Updated ${res.summary?.updated || 0}, removed ${res.summary?.removed || 0}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ids = selection.selectedIds;

  const importUsers = async (rows) => {
    const payload = {
      create: rows.map((r) => ({
        username: r.username,
        name: r.name,
        role: (r.role || 'player').toLowerCase().startsWith('admin') ? 'admin' : 'player',
        password: r.password || undefined,
      })),
    };
    const res = await api.bulkUsers(payload);
    load();
    if (res.issued?.length) setIssued(res.issued);
    return res;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Players & organizers</h1>
          <p className="muted">Create accounts, bulk import, or manage roles.</p>
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>
            Import CSV
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => downloadCSV(`accounts-${Date.now()}.csv`, users, EXPORT_COLUMNS)}
          >
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => setModal({})}>
            + New account
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name or username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted small">{filtered.length} of {users.length}</span>
      </div>

      <BulkBar count={selection.count} onClear={selection.clear}>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ activate: ids }, 'Activated selected accounts.')}>
          Activate
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ deactivate: ids }, 'Disabled selected accounts.')}>
          Disable
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ update: ids.map((id) => ({ id, role: 'admin' })) }, 'Promoted to organizer.')}>
          Make organizer
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => runBulk({ update: ids.map((id) => ({ id, role: 'player' })) }, 'Set to player.')}>
          Make player
        </button>
        <button
          className="btn btn-danger btn-sm"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${ids.length} account(s)? This cannot be undone.`)) {
              runBulk({ remove: ids }, 'Deleted selected accounts.');
            }
          }}
        >
          Delete
        </button>
      </BulkBar>

      {loading ? (
        <Spinner />
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="check-col">
                  <SelectAllBox rows={filtered} selection={selection} />
                </th>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={selectedSet.has(u.id) ? 'row-selected' : ''}>
                  <td className="check-col">
                    <RowCheck row={u} selection={selection} />
                  </td>
                  <td>
                    <Link className="player-link" to={`/players/${u.id}`}>
                      {u.name}
                    </Link>
                  </td>
                  <td className="muted">@{u.username}</td>
                  <td>
                    <select value={u.role} onChange={(e) => setRole(u, e.target.value)}>
                      <option value="player">Player</option>
                      <option value="admin">Organizer</option>
                    </select>
                  </td>
                  <td>
                    <span className={u.active ? 'status status-active' : 'status status-cancelled'}>
                      {u.active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(u)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <NewUserModal
          onClose={() => setModal(null)}
          onCreated={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {importOpen && (
        <ImportDialog
          title="Import accounts"
          help="Paste or upload a CSV. A password column is optional — blank passwords are generated and shown after import."
          columns={IMPORT_COLUMNS}
          onSubmit={importUsers}
          onClose={() => setImportOpen(false)}
        />
      )}

      {issued && (
        <Modal
          title="Generated credentials"
          onClose={() => setIssued(null)}
          footer={
            <>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  downloadCSV(
                    `new-accounts-${Date.now()}.csv`,
                    issued,
                    [
                      { key: 'name', label: 'name' },
                      { key: 'username', label: 'username' },
                      { key: 'password', label: 'password' },
                    ]
                  )
                }
              >
                Download CSV
              </button>
              <button className="btn btn-primary" onClick={() => setIssued(null)}>
                Done
              </button>
            </>
          }
        >
          <p className="muted">Share these one-time passwords with the new players.</p>
          <div className="table-wrap">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Password</th>
                </tr>
              </thead>
              <tbody>
                {issued.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>@{u.username}</td>
                    <td>
                      <code>{u.password}</code>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigator.clipboard?.writeText(`${u.username} / ${u.password}`)}
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'player' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createUser(form);
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="New account" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={upd('name')} required autoFocus />
        </label>
        <label className="field">
          <span>Username</span>
          <input value={form.username} onChange={upd('username')} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={form.password} onChange={upd('password')} minLength={6} required />
        </label>
        <label className="field">
          <span>Role</span>
          <select value={form.role} onChange={upd('role')}>
            <option value="player">Player</option>
            <option value="admin">Organizer</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
