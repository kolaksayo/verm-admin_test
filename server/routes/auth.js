const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { getDb } = require('../sqlite');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function getSetting(db, key, defaultVal) {
  const row = db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

// Superadmin has no grant rows (permissions are meaningless for it — always full access).
function loadPermissions(db, userId, role) {
  if (role === 'superadmin') return [];
  return db.prepare('SELECT category, subcategory FROM admin_permission_grants WHERE user_id = ?').all(userId);
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const enforceMfa = getSetting(db, 'enforce_mfa', 'false') === 'true';

  if (user.two_factor_enabled) {
    const tempToken = jwt.sign(
      { id: user.id, username: user.username, pending2fa: true },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ requires2fa: true, tempToken });
  } else if (enforceMfa && !user.two_factor_exempt) {
    const tempToken = jwt.sign(
      { id: user.id, username: user.username, pendingMfaSetup: true },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );
    return res.json({ requiresMfaSetup: true, tempToken });
  } else {
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    return res.json({ token, username: user.username, role: user.role, permissions: loadPermissions(db, user.id, user.role) });
  }
});

router.post('/verify-2fa', (req, res) => {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ error: 'Token and code are required' });
  }

  let payload;
  try {
    payload = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }

  if (!payload.pending2fa) {
    return res.status(400).json({ error: 'Invalid token type' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const valid = speakeasy.totp.verify({
    secret: user.two_factor_secret,
    encoding: 'base32',
    token: String(code),
    window: 1,
  });

  if (!valid) return res.status(401).json({ error: 'Invalid 2FA code' });

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, username: user.username, role: user.role, permissions: loadPermissions(db, user.id, user.role) });
});

router.post('/complete-mfa-setup', (req, res) => {
  const { tempToken } = req.body;
  if (!tempToken) return res.status(400).json({ error: 'Token required' });
  let payload;
  try {
    payload = jwt.verify(tempToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  if (!payload.pendingMfaSetup) return res.status(400).json({ error: 'Invalid token type' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(payload.id);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (!user.two_factor_enabled) return res.status(400).json({ error: 'MFA setup not complete' });
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, username: user.username, role: user.role, permissions: loadPermissions(db, user.id, user.role) });
});

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  res.json({
    username: req.user.username,
    role: req.user.role,
    permissions: loadPermissions(db, req.user.id, req.user.role),
  });
});

const EDIT_DURATION_MINUTES = 10;

// POST /auth/elevate — request temporary edit access
router.post('/elevate', authMiddleware, (req, res) => {
  const { role, id, username } = req.user;
  if (!['superadmin', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Edit access requires admin role or higher' });
  }

  const reason = req.body.reason ? String(req.body.reason).slice(0, 500).trim() || null : null;
  const db = getDb();

  // Drop any existing active session for this user first
  db.prepare(
    "UPDATE admin_edit_sessions SET dropped_at = datetime('now'), drop_reason = 'superseded' WHERE user_id = ? AND dropped_at IS NULL"
  ).run(id);

  const result = db.prepare(`
    INSERT INTO admin_edit_sessions (user_id, username, reason, expires_at)
    VALUES (?, ?, ?, datetime('now', '+${EDIT_DURATION_MINUTES} minutes'))
  `).run(id, username, reason || null);

  const session = db.prepare('SELECT * FROM admin_edit_sessions WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, sessionId: session.id, expiresAt: session.expires_at.replace(' ', 'T') + 'Z' });
});

// POST /auth/drop-elevation — end edit session
router.post('/drop-elevation', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare(
    "UPDATE admin_edit_sessions SET dropped_at = datetime('now'), drop_reason = 'user_dropped' WHERE user_id = ? AND dropped_at IS NULL"
  ).run(req.user.id);
  res.json({ ok: true });
});

// GET /auth/elevation-status — check if current user has active edit session
router.get('/elevation-status', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare(
    "SELECT id, reason, elevated_at, expires_at FROM admin_edit_sessions WHERE user_id = ? AND dropped_at IS NULL AND expires_at > datetime('now') LIMIT 1"
  ).get(req.user.id);

  if (!session) return res.json({ active: false });
  res.json({ active: true, sessionId: session.id, reason: session.reason, elevatedAt: session.elevated_at, expiresAt: session.expires_at.replace(' ', 'T') + 'Z' });
});

module.exports = router;
