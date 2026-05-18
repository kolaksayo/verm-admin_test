const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const DEPOSIT_BASE = {
  type:        { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  status:      'PAID',
};

const WITHDRAWAL_BASE = {
  type:        { $regex: /^DEBIT$/i },
  description: { $regex: /safehaven naira transfer/i },
  status:      'PAID',
};

// GET /api/nav-badges
router.get('/', auth, async (req, res) => {
  try {
    const db  = getDb();
    const now = Date.now();
    const h24 = new Date(now - 24 * 60 * 60 * 1000);
    const d7  = new Date(now - 7  * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      dep24h, dep7d, dep30d, depAll,
      wit24h, wit7d, wit30d, witAll,
    ] = await Promise.all([
      db.collection('transactions').countDocuments({ ...DEPOSIT_BASE,    createdAt: { $gte: h24 } }),
      db.collection('transactions').countDocuments({ ...DEPOSIT_BASE,    createdAt: { $gte: d7  } }),
      db.collection('transactions').countDocuments({ ...DEPOSIT_BASE,    createdAt: { $gte: d30 } }),
      db.collection('transactions').countDocuments(DEPOSIT_BASE),
      db.collection('transactions').countDocuments({ ...WITHDRAWAL_BASE, createdAt: { $gte: h24 } }),
      db.collection('transactions').countDocuments({ ...WITHDRAWAL_BASE, createdAt: { $gte: d7  } }),
      db.collection('transactions').countDocuments({ ...WITHDRAWAL_BASE, createdAt: { $gte: d30 } }),
      db.collection('transactions').countDocuments(WITHDRAWAL_BASE),
    ]);

    res.json({
      transactions: dep24h + wit24h, // combined 24h — drives sidebar badge
      deposits:    { h24: dep24h, d7: dep7d, d30: dep30d, allTime: depAll },
      withdrawals: { h24: wit24h, d7: wit7d, d30: wit30d, allTime: witAll },
    });
  } catch (err) {
    console.error('Nav badges error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
