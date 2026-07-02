const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');
const { requireEditMode, requireRole } = require('../middleware/auth');

const router = express.Router();

function getSetting(sqlite, key, def) {
  const row = sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

function setSetting(sqlite, key, value) {
  sqlite.prepare(`
    INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

// GET /api/signup-bonus/settings
router.get('/settings', auth, (req, res) => {
  try {
    const sqlite  = getSQLite();
    const enabled = getSetting(sqlite, 'signup_bonus_enabled', 'true') === 'true';
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/signup-bonus/settings
router.post('/settings', auth, requireEditMode, (req, res) => {
  try {
    const sqlite = getSQLite();
    const { enabled } = req.body;
    if (enabled !== undefined) setSetting(sqlite, 'signup_bonus_enabled', enabled ? 'true' : 'false');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signup-bonus/rules
router.get('/rules', auth, (req, res) => {
  try {
    const rows = getSQLite().prepare('SELECT * FROM signup_bonus_rules ORDER BY referral_code').all();
    res.json(rows.map((r) => ({
      referralCode: r.referral_code,
      amount:       r.amount,
      currencyId:   r.currency_id,
      currencyName: r.currency_name,
      active:       !!r.active,
      notes:        r.notes,
      createdAt:    r.created_at,
      updatedAt:    r.updated_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/signup-bonus/rules/:referralCode — create or update a bonus rule.
// NOTE: created_at is intentionally never touched on conflict — it's the forward-only
// cutoff the watcher uses, so editing a rule must never shift which signups qualify.
router.post('/rules/:referralCode', auth, requireEditMode, async (req, res) => {
  try {
    const code = String(req.params.referralCode || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ error: 'Referral code is required' });

    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be a positive number' });

    const currencyId = req.body.currencyId;
    if (!currencyId) return res.status(400).json({ error: 'currencyId is required' });

    let currencyOid;
    try { currencyOid = new ObjectId(currencyId); } catch { return res.status(400).json({ error: 'Invalid currencyId' }); }

    const currency = await getDb().collection('currencytypes').findOne(
      { _id: currencyOid },
      { projection: { name: 1 } },
    );
    if (!currency) return res.status(400).json({ error: 'Currency not found' });

    const notes  = req.body.notes ? String(req.body.notes).slice(0, 200) : null;
    const active = req.body.active === undefined ? 1 : (req.body.active ? 1 : 0);

    const sqlite = getSQLite();
    sqlite.prepare(`
      INSERT INTO signup_bonus_rules (referral_code, amount, currency_id, currency_name, active, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(referral_code) DO UPDATE SET
        amount        = excluded.amount,
        currency_id   = excluded.currency_id,
        currency_name = excluded.currency_name,
        active        = excluded.active,
        notes         = excluded.notes,
        updated_at    = excluded.updated_at
    `).run(code, amount, String(currencyId), currency.name || null, active, notes);

    const saved = sqlite.prepare('SELECT * FROM signup_bonus_rules WHERE referral_code = ?').get(code);
    res.json({
      ok:           true,
      referralCode: saved.referral_code,
      amount:       saved.amount,
      currencyId:   saved.currency_id,
      currencyName: saved.currency_name,
      active:       !!saved.active,
      notes:        saved.notes,
      createdAt:    saved.created_at,
      updatedAt:    saved.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signup-bonus/grants — log of signup bonuses granted (or attempted).
// Amount is read from admin_credits via admin_credit_id, not stored on this table,
// since admin_credits is the single source of truth for what was actually credited.
router.get('/grants', auth, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const sqlite = getSQLite();
    const limit  = Math.min(500, parseInt(req.query.limit) || 200);
    const status = req.query.status || null;

    const conditions = [];
    const params = [];
    if (status) { conditions.push('g.status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = sqlite.prepare(`
      SELECT g.*, ac.amount AS credited_amount, ac.created_at AS credited_at
      FROM signup_bonus_grants g
      LEFT JOIN admin_credits ac ON ac.id = g.admin_credit_id
      ${where}
      ORDER BY g.id DESC
      LIMIT ?
    `).all(...params, limit);

    const db = getDb();
    const userIds = rows
      .map((r) => { try { return new ObjectId(r.user_id); } catch { return null; } })
      .filter(Boolean);
    const users = userIds.length
      ? await db.collection('users')
          .find({ _id: { $in: userIds } }, { projection: { username: 1, displayName: 1, name: 1 } })
          .toArray()
      : [];
    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = u.username || u.displayName || u.name || u._id.toString();
    });

    res.json(rows.map((r) => ({
      id:            r.id,
      userId:        r.user_id,
      username:      userMap[r.user_id] || r.user_id,
      referralCode:  r.referral_code,
      status:        r.status,
      amount:        r.credited_amount ?? null,
      currencyName:  r.currency_name,
      attempts:      r.attempts,
      error:         r.error,
      grantedAt:     r.credited_at || null,
      createdAt:     r.created_at,
      updatedAt:     r.updated_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
