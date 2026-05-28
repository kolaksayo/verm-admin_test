const jwt = require('jsonwebtoken');
const { getDb: getSQLite } = require('../sqlite');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.pending2fa) return res.status(401).json({ error: 'Complete 2FA verification first' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function requireEditMode(req, res, next) {
  const { id, role } = req.user || {};
  if (!['superadmin', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Edit access requires admin role or higher' });
  }
  try {
    const db = getSQLite();
    const session = db.prepare(
      "SELECT id FROM admin_edit_sessions WHERE user_id = ? AND dropped_at IS NULL AND expires_at > datetime('now') LIMIT 1"
    ).get(id);
    if (!session) {
      return res.status(403).json({ error: 'Edit mode not active — request elevation first', code: 'ELEVATION_REQUIRED' });
    }
    req.editSessionId = session.id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
module.exports.requireEditMode = requireEditMode;
