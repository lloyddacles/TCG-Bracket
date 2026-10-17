const TOKEN_KEY = 'tcg_token';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function handleAuthError(status) {
  if (status !== 401) return;
  setToken(null);
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error('Could not reach the server. Check your connection and try again.');
    err.network = true;
    throw err;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (auth) handleAuthError(res.status);
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  register: (data) => request('/auth/register', { method: 'POST', body: data, auth: false }),
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => request('/auth/me'),
  updateCard: (data) => request('/auth/card', { method: 'PUT', body: data }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),

  getGames: () => request('/games'),

  getTournaments: (params = {}) =>
    request(`/tournaments?${new URLSearchParams(params).toString()}`),
  getTournament: (id) => request(`/tournaments/${id}`),
  createTournament: (data) => request('/tournaments', { method: 'POST', body: data }),
  updateTournament: (id, data) => request(`/tournaments/${id}`, { method: 'PUT', body: data }),
  deleteTournament: (id) => request(`/tournaments/${id}`, { method: 'DELETE' }),
  startTournament: (id) => request(`/tournaments/${id}/start`, { method: 'POST' }),
  registerForTournament: (id) => request(`/tournaments/${id}/register`, { method: 'POST' }),
  unregisterFromTournament: (id) => request(`/tournaments/${id}/unregister`, { method: 'POST' }),
  addPlayer: (id, username) => request(`/tournaments/${id}/players`, { method: 'POST', body: { username } }),
  scanTournament: (id, payload) => request(`/tournaments/${id}/scan`, { method: 'POST', body: payload }),
  bulkPlayers: (id, payload) => request(`/tournaments/${id}/players/bulk`, { method: 'POST', body: payload }),
  bulkMatches: (id, payload) => request(`/tournaments/${id}/matches/bulk`, { method: 'POST', body: payload }),
  bulkTournaments: (payload) => request('/tournaments/bulk', { method: 'POST', body: payload }),
  updatePlayer: (id, playerId, data) =>
    request(`/tournaments/${id}/players/${playerId}`, { method: 'PUT', body: data }),
  removePlayer: (id, playerId) => request(`/tournaments/${id}/players/${playerId}`, { method: 'DELETE' }),

  reportMatch: (matchId, data) => request(`/matches/${matchId}/report`, { method: 'POST', body: data }),
  approveMatch: (matchId, data = {}) => request(`/matches/${matchId}/approve`, { method: 'POST', body: data }),
  setMatchResult: (matchId, data) => request(`/matches/${matchId}/result`, { method: 'POST', body: data }),
  resetMatch: (matchId) => request(`/matches/${matchId}/reset`, { method: 'POST' }),

  getUsers: () => request('/users'),
  createUser: (data) => request('/users', { method: 'POST', body: data }),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: data }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  bulkUsers: (payload) => request('/users/bulk', { method: 'POST', body: payload }),

  publicTournament: (slug) => request(`/public/${slug}`, { auth: false }),
};
