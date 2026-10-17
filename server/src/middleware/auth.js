import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getUser } from '../services/users.js';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: '12h' }
  );
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  try {
    const user = await getUser(payload.id);
    if (!user || Number(user.active) === 0) {
      return res.status(401).json({ error: 'Account is inactive or no longer exists' });
    }
    req.user = user;
    if (req.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(pathname(req.originalUrl))) {
      return res.status(403).json({
        error: 'You must change your password before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/password', '/api/auth/me']);

function pathname(url) {
  const path = String(url || '').split('?')[0];
  return path.replace(/\/+$/, '') || path;
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' });
    }
    next();
  };
}

// Optional auth: attaches req.user when a valid token is present, but never blocks.
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getUser(payload.id);
    if (user && Number(user.active) !== 0) req.user = user;
  } catch {
    // ignore
  }
  next();
}
