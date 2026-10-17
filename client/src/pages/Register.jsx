import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const upd = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark big">⚔</span>
          <h1>Create your account</h1>
          <p>Register for tournaments and report your results</p>
        </div>
        <form onSubmit={onSubmit} className="stack">
          {error && <div className="alert alert-error">{error}</div>}
          <label className="field">
            <span>Display name</span>
            <input value={form.name} onChange={upd('name')} required autoFocus />
          </label>
          <label className="field">
            <span>Username</span>
            <input value={form.username} onChange={upd('username')} autoComplete="username" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={upd('password')}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="auth-alt">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
