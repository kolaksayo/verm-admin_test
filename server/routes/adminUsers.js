const express = require('express');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getDb } = require('../sqlite');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_ROLES = ['superadmin', 'admin', 'viewer'];

function safeUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    two_factor_enabled: !!u.two_factor_enabled,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

// ── Own profile ──────────────────────────────────────────────────────────────

router.get('/me', auth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
});

router.patch('/me/password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hashed = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE admin_users SET password = ?, updated_at = datetime("now") WHERE id = ?')
    .run(hashed, req.user.id);

  res.json({ message: 'Password updated successfully' });
});

// ── 2FA setup ────────────────────────────────────────────────────────────────

router.post('/me/2fa/setup', auth, async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `Verm Admin (${req.user.username})`,
    length: 32,
  });

  const db = getDb();
  db.prepare('UPDATE admin_users SET two_factor_secret = ?, two_factor_enabled = 0, updated_at = datetime("now") WHERE id = ?')
    .run(secret.base32, req.user.id);

  try {
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ qrCode, secret: secret.base32 });
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

router.post('/me/2fa/enable', auth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);

  if (!user.two_factor_secret) {
    return res.status(400).json({ error: 'Run 2FA setup first' });
  }

  const valid = speakeasy.totp.verify({
    secret: user.two_factor_secret,
    encoding: 'base32',
    token: String(code),
    window: 1,
  });

  if (!valid) return res.status(400).json({ error: 'Invalid code, please try again' });

  db.prepare('UPDATE admin_users SET two_factor_enabled = 1, updated_at = datetime("now") WHERE id = ?')
    .run(req.user.id);

  res.json({ message: '2FA enabled successfully' });
});

router.delete('/me/2fa', auth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Authenticator code is required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);

  if (!user.two_factor_enabled) {
    return res.status(400).json({ error: '2FA is not enabled' });
  }

  const valid = speakeasy.totp.verify({
    secret: user.two_factor_secret,
    encoding: 'base32',
    token: String(code),
    window: 1,
  });

  if (!valid) return res.status(400).json({ error: 'Invalid code' });

  db.prepare('UPDATE admin_users SET two_factor_enabled = 0, two_factor_secret = NULL, updated_at = datetime("now") WHERE id = ?')
    .run(req.user.id);

  res.json({ message: '2FA disabled' });
});

// ── Admin user management (superadmin only) ──────────────────────────────────

router.get('/', auth, requireRole('superadmin'), (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT * FROM admin_users ORDER BY created_at DESC').all();
  res.json(users.map(safeUser));
});

router.post('/', auth, requireRole('superadmin'), (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password and role are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const hashed = bcrypt.hashSync(password, 12);
  const result = db.prepare(
    'INSERT INTO admin_users (username, password, role) VALUES (?, ?, ?)'
  ).run(username, hashed, role);

  const created = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(safeUser(created));
});

router.patch('/:id', auth, requireRole('superadmin'), (req, res) => {
  const id = parseInt(req.params.id);
  const { role, password } = req.body;

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    // Prevent removing the last superadmin
    if (user.role === 'superadmin' && role !== 'superadmin') {
      const superadminCount = db.prepare("SELECT COUNT(*) as c FROM admin_users WHERE role = 'superadmin'").get().c;
      if (superadminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last superadmin' });
      }
    }
    db.prepare('UPDATE admin_users SET role = ?, updated_at = datetime("now") WHERE id = ?').run(role, id);
  }

  if (password !== undefined) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hashed = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE admin_users SET password = ?, updated_at = datetime("now") WHERE id = ?').run(hashed, id);
  }

  const updated = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  res.json(safeUser(updated));
});

router.delete('/:id', auth, requireRole('superadmin'), (req, res) => {
  const id = parseInt(req.params.id);

  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'superadmin') {
    const count = db.prepare("SELECT COUNT(*) as c FROM admin_users WHERE role = 'superadmin'").get().c;
    if (count <= 1) return res.status(400).json({ error: 'Cannot delete the last superadmin' });
  }

  db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  res.json({ message: 'User deleted' });
});

module.exports = router;
