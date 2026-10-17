import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Spinner from './components/Spinner.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TournamentNew from './pages/TournamentNew.jsx';
import TournamentDetail from './pages/TournamentDetail.jsx';
import PrintView from './pages/PrintView.jsx';
import PublicTournament from './pages/PublicTournament.jsx';
import Users from './pages/Users.jsx';
import Profile from './pages/Profile.jsx';
import CardStudio from './pages/CardStudio.jsx';
import ScanDesk from './pages/ScanDesk.jsx';

function Protected({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner full />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/t/:slug" element={<PublicTournament />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/tournaments/new" element={<Protected adminOnly><TournamentNew /></Protected>} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="/tournaments/:id/print" element={<PrintView />} />
        <Route path="/card" element={<CardStudio />} />
        <Route path="/scan" element={<ScanDesk />} />
        <Route path="/users" element={<Protected adminOnly><Users /></Protected>} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
