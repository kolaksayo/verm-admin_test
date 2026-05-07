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

module.exports = router;
