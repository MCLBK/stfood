const crypto = require('crypto');

// Sessions en mémoire : simple et suffisant pour un panneau admin mono-instance.
// (Si le serveur redémarre, il faut se reconnecter — acceptable pour ce contexte.)
const sessions = new Map(); // token -> { username, expires }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function createSession(username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) {
    return res.status(401).json({ error: 'Non autorisé — reconnectez-vous à l\'admin.' });
  }
  req.adminUser = session.username;
  next();
}

module.exports = { verifyPassword, createSession, requireAdmin, sessions };
