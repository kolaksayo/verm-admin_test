const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { getDb } = require('../sqlite');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.two_factor_enabled) {
    const tempToken = jwt.sign(
      { id: user.id, username: user.username, pending2fa: true },
      process.env.JWT_SECRET,
      { expiresIn: '5m' }
    );
    return res.json({ requires2fa: true, tempToken });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, username: user.username, role: user.role });
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
  res.json({ token, username: user.username, role: user.role });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

const EDIT_DURATION_MINUTES = 30;

// POST /auth/elevate — request temporary edit access
router.post('/elevate', authMiddleware, (req, res) => {
  const { role, id, username } = req.user;
  if (!['superadmin', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Edit access requires admin role or higher' });
  }

  const { reason } = req.body;
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
  res.json({ ok: true, sessionId: session.id, expiresAt: session.expires_at });
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
  res.json({ active: true, sessionId: session.id, reason: session.reason, elevatedAt: session.elevated_at, expiresAt: session.expires_at });
});

module.exports = router;
