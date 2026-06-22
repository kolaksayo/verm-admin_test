const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb, getWriteDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');
const { requireEditMode, requireRole } = require('../middleware/auth');

const router = express.Router();

// Shared helper — applies a wallet balance adjustment and logs it to SQLite
async function applyAdjustment(req, { walletId, userId, amount, notes, txType, description, action }) {
  const rDb = getDb();
  const wDb = getWriteDb();

  let walletOid;
  try { walletOid = new ObjectId(walletId); } catch { walletOid = walletId; }

  const wallet = await rDb.collection('walletusers').findOne({ _id: walletOid });
  if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

  const balanceBefore = wallet.walletBalance ?? wallet.balance ?? 0;
  const balanceAfter  = parseFloat((balanceBefore + amount).toFixed(8));

  if (txType === 'DEBIT' && balanceAfter < 0) {
    throw Object.assign(
      new Error(`Insufficient balance — current: ${balanceBefore.toFixed(2)}, debit: ${Math.abs(amount).toFixed(2)}`),
      { status: 400 },
    );
  }

  const balanceField = 'walletBalance' in wallet ? 'walletBalance' : 'balance';
  await wDb.collection('walletusers').updateOne(
    { _id: walletOid },
    { $set: { [balanceField]: balanceAfter, updatedAt: new Date() } },
  );

  // Resolve currency name
  let currencyName = null;
  if (wallet.currencyType) {
    try {
      const curr = await rDb.collection('currencytypes').findOne(
        { _id: new ObjectId(wallet.currencyType.toString()) },
        { projection: { name: 1 } },
      );
      if (curr) currencyName = curr.name;
    } catch {}
  }

  // Resolve user profile for richer audit context
  let userProfile = null;
  try {
    const userOid = new ObjectId(String(userId));
    const u = await rDb.collection('users').findOne(
      { _id: userOid },
      { projection: { username: 1, email: 1, name: 1, mobile: 1, phone: 1, isVerified: 1 } },
    );
    if (u) {
      userProfile = {
        userId:     String(userId),
        username:   u.username  || null,
        name:       u.name      || null,
        email:      u.email     || null,
        phone:      u.mobile    || u.phone || null,
        isVerified: u.isVerified ?? null,
      };
    }
  } catch { /* non-fatal — log without user details */ }

  const walletContext = {
    walletId:     String(walletId),
    currency:     currencyName || String(wallet.currencyType || ''),
    [balanceField]: null, // placeholder filled per before/after below
    ...(userProfile || { userId: String(userId) }),
  };

  const sqlite = getSQLite();

  sqlite.prepare(`
    INSERT INTO admin_credits
      (admin_user, session_id, user_id, wallet_id, currency_name, amount, balance_before, balance_after, description, notes, tx_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.username,
    req.editSessionId || null,
    String(userId),
    String(walletId),
    currencyName,
    Math.abs(amount),
    balanceBefore,
    balanceAfter,
    description,
    notes || null,
    txType,
  );

  sqlite.prepare(`
    INSERT INTO admin_activity_logs
      (admin_user, session_id, action, collection, document_id, before_json, after_json)
    VALUES (?, ?, ?, 'walletusers', ?, ?, ?)
  `).run(
    req.user.username,
    req.editSessionId || null,
    action,
    String(walletId),
    JSON.stringify({ ...walletContext, [balanceField]: balanceBefore }),
    JSON.stringify({
      ...walletContext,
      [balanceField]: balanceAfter,
      adjustment: {
        type:        txType,
        amount:      Math.abs(amount),
        description,
        notes:       notes || null,
        adminUser:   req.user.username,
      },
    }),
  );

  return { balanceBefore, balanceAfter, amount: Math.abs(amount) };
}

// POST /api/admin-credit — manually credit a user's wallet
router.post('/', auth, requireEditMode, async (req, res) => {
  const { walletId, userId, amount, notes } = req.body;
  if (!walletId || !userId) return res.status(400).json({ error: 'walletId and userId are required' });
  const parsed = parseFloat(amount);
  if (!parsed || parsed <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  try {
    const result = await applyAdjustment(req, {
      walletId, userId, amount: parsed, notes,
      txType: 'CREDIT', description: 'Admin TOP UP', action: 'credit',
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin-credit] credit error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to apply credit' });
  }
});

// POST /api/admin-credit/debit — manually debit a user's wallet
router.post('/debit', auth, requireEditMode, async (req, res) => {
  const { walletId, userId, amount, notes } = req.body;
  if (!walletId || !userId) return res.status(400).json({ error: 'walletId and userId are required' });
  const parsed = parseFloat(amount);
  if (!parsed || parsed <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  try {
    const result = await applyAdjustment(req, {
      walletId, userId, amount: -parsed, notes,
      txType: 'DEBIT', description: 'Admin Debit', action: 'debit',
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin-credit] debit error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to apply debit' });
  }
});

// GET /api/admin-credit/history/:userId — adjustment history for a specific user
router.get('/history/:userId', auth, requireRole('superadmin', 'admin'), (req, res) => {
  try {
    const rows = getSQLite().prepare(
      `SELECT * FROM admin_credits WHERE user_id = ? ORDER BY id DESC LIMIT 200`
    ).all(req.params.userId);

    res.json(rows.map((r) => ({
      id:            r.id,
      txType:        r.tx_type || 'CREDIT',
      adminUser:     r.admin_user,
      userId:        r.user_id,
      currencyName:  r.currency_name,
      amount:        r.amount,
      balanceBefore: r.balance_before,
      balanceAfter:  r.balance_after,
      description:   r.description,
      notes:         r.notes,
      createdAt:     r.created_at,
    })));
  } catch (err) {
    console.error('[admin-credit] history error:', err);
    res.status(500).json({ error: 'Failed to fetch adjustment history' });
  }
});

module.exports = router;
