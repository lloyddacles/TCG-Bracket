import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();
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
    <div className="page narrow">
      <div className="page-head">
        <h1>Your profile</h1>
      </div>
      <div className="card stack">
        <div className="profile-head">
          <span className="user-avatar big">{(user?.name || '?').charAt(0).toUpperCase()}</span>
          <div>
            <h2>{user?.name}</h2>
            <p className="muted">
              @{user?.username} · {user?.role === 'admin' ? 'Tournament Organizer' : 'Player'}
            </p>
          </div>
        </div>
        <hr />
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
    </div>
  );
}
