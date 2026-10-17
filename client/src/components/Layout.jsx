import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">⚔</span>
          <span className="brand-text">TCG Bracket</span>
        </Link>
        <nav className="topnav">
          <NavLink to="/" end>
            Tournaments
          </NavLink>
          <NavLink to="/card">My Card</NavLink>
          <NavLink to="/scan">Scan Desk</NavLink>
          {isAdmin && <NavLink to="/tournaments/new">New</NavLink>}
          {isAdmin && <NavLink to="/users">Players</NavLink>}
        </nav>
        <div className="user-area">
          <Link to="/profile" className="user-chip" title="Your profile">
            <span className="user-avatar">{(user?.name || '?').charAt(0).toUpperCase()}</span>
            <span className="user-meta">
              <strong>{user?.name}</strong>
              <em>{isAdmin ? 'Tournament Organizer' : 'Player'}</em>
            </span>
          </Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-foot">
        <span>TCG Bracket — Swiss · Single Elim · Double Elim · Round Robin</span>
      </footer>
    </div>
  );
}
