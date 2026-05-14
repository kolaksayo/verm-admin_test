const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const DEPOSIT_FILTER = {
  type:        { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
  status: { $regex: /^pending$/i },
};

const WITHDRAWAL_FILTER = {
  type:        { $regex: /^DEBIT$/i },
  description: { $regex: /safehaven naira transfer/i },
  status: { $regex: /^pending$/i },
};

// GET /api/nav-badges — returns pending counts for sidebar badges
router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const [deposits, withdrawals] = await Promise.all([
      db.collection('transactions').countDocuments(DEPOSIT_FILTER),
      db.collection('transactions').countDocuments(WITHDRAWAL_FILTER),
    ]);
    res.json({ ngnDeposits: deposits, ngnWithdrawals: withdrawals });
  } catch (err) {
    console.error('Nav badges error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
