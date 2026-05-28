const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb, getWriteDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');
const { requireEditMode } = require('../middleware/auth');

const router = express.Router();

// POST /api/admin-credit — manually credit a user's wallet
// Requires edit mode. Updates walletBalance in MongoDB; logs locally in SQLite.
router.post('/', auth, requireEditMode, async (req, res) => {
  const { walletId, userId, amount, notes } = req.body;

  if (!walletId || !userId) {
    return res.status(400).json({ error: 'walletId and userId are required' });
  }
  const parsedAmount = parseFloat(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  try {
    const rDb = getDb();
    const wDb = getWriteDb();

    let walletOid;
    try { walletOid = new ObjectId(walletId); } catch { walletOid = walletId; }

    const wallet = await rDb.collection('walletusers').findOne({ _id: walletOid });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const balanceBefore = wallet.walletBalance ?? wallet.balance ?? 0;
    const balanceAfter = parseFloat((balanceBefore + parsedAmount).toFixed(8));

    // Determine which balance field the document actually uses
    const balanceField = 'walletBalance' in wallet ? 'walletBalance' : 'balance';

    await wDb.collection('walletusers').updateOne(
      { _id: walletOid },
      { $set: { [balanceField]: balanceAfter, updatedAt: new Date() } },
    );

    // Resolve currency name for the log
    let currencyName = null;
    if (wallet.currencyType) {
      try {
        const currOid = new ObjectId(wallet.currencyType.toString());
        const curr = await rDb.collection('currencytypes').findOne({ _id: currOid }, { projection: { name: 1 } });
        if (curr) currencyName = curr.name;
      } catch {}
    }

    // Log to local SQLite — description stays off the remote MongoDB
    getSQLite().prepare(`
      INSERT INTO admin_credits
        (admin_user, session_id, user_id, wallet_id, currency_name, amount, balance_before, balance_after, description, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Admin Credit', ?)
    `).run(
      req.user.username,
      req.editSessionId || null,
      String(userId),
      String(walletId),
      currencyName,
      parsedAmount,
      balanceBefore,
      balanceAfter,
      notes || null,
    );

    // Also write to the general admin_activity_logs for the audit trail
    getSQLite().prepare(`
      INSERT INTO admin_activity_logs
        (admin_user, session_id, action, collection, document_id, before_json, after_json)
      VALUES (?, ?, 'credit', 'walletusers', ?, ?, ?)
    `).run(
      req.user.username,
      req.editSessionId || null,
      String(walletId),
      JSON.stringify({ [balanceField]: balanceBefore }),
      JSON.stringify({ [balanceField]: balanceAfter }),
    );

    res.json({ ok: true, balanceBefore, balanceAfter, amount: parsedAmount });
  } catch (err) {
    console.error('[admin-credit] error:', err);
    res.status(500).json({ error: 'Failed to apply credit' });
  }
});

// GET /api/admin-credit/history/:userId — credit history for a specific user
router.get('/history/:userId', auth, (req, res) => {
  try {
    const rows = getSQLite().prepare(
      `SELECT * FROM admin_credits WHERE user_id = ? ORDER BY id DESC LIMIT 100`
    ).all(req.params.userId);

    res.json(rows.map((r) => ({
      id:            r.id,
      adminUser:     r.admin_user,
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
