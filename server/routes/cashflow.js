const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Safehaven deposit / withdrawal detection helpers
// Transactions use type values like 'safehaven_deposit', 'SAFEHAVEN_DEPOSIT', etc.
// We match case-insensitively on keywords.
function safehavenDepositFilter() {
  return { type: { $regex: /safehaven.*deposit|deposit.*safehaven|naira.*deposit|deposit.*naira/i } };
}

function safehavenWithdrawalFilter() {
  return { type: { $regex: /safehaven.*withdraw|withdraw.*safehaven|naira.*withdraw|withdraw.*naira/i } };
}

// ── GET /api/cashflow/summary ──────────────────────────────────────────────────
// Returns overall totals for each revenue stream + monthly time-series.

router.get('/summary', auth, async (req, res) => {
  try {
    const db = getDb();

    // Discover all distinct transaction types (for debugging/display)
    const distinctTypes = await db.collection('transactions').distinct('type');

    // ── 1. Bet fee revenue ────────────────────────────────────────────────────
    const betFeeAgg = await db.collection('game_bet').aggregate([
      { $match: { totalFeesDeducted: { $exists: true, $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalFees: { $sum: '$totalFeesDeducted' },
          betCount: { $sum: 1 },
        },
      },
    ]).toArray();

    // Monthly bet fees
    const betFeeMonthly = await db.collection('game_bet').aggregate([
      { $match: { totalFeesDeducted: { $exists: true, $gt: 0 }, createdAt: { $exists: true } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          fees: { $sum: '$totalFeesDeducted' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 2. Deposit fee revenue (100 NGN per Safehaven NGN deposit) ────────────
    const depositAgg = await db.collection('transactions').aggregate([
      { $match: safehavenDepositFilter() },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]).toArray();

    // Monthly deposits
    const depositMonthly = await db.collection('transactions').aggregate([
      { $match: { ...safehavenDepositFilter(), createdAt: { $exists: true } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 3. Withdrawal fee revenue (200 NGN spread per Safehaven NGN withdrawal) ──
    const withdrawalAgg = await db.collection('transactions').aggregate([
      { $match: safehavenWithdrawalFilter() },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]).toArray();

    // Monthly withdrawals
    const withdrawalMonthly = await db.collection('transactions').aggregate([
      { $match: { ...safehavenWithdrawalFilter(), createdAt: { $exists: true } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 4. All transaction type breakdown (to surface any misclassified types) ─
    const typeBreakdown = await db.collection('transactions').aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray();

    // ── 5. Monthly all-transaction totals ─────────────────────────────────────
    const allTxMonthly = await db.collection('transactions').aggregate([
      { $match: { createdAt: { $exists: true } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            type: '$type',
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    const DEPOSIT_FEE_NGN = 100;
    const WITHDRAWAL_FEE_NGN = 200;

    const depositCount = depositAgg[0]?.count ?? 0;
    const withdrawalCount = withdrawalAgg[0]?.count ?? 0;
    const totalBetFees = betFeeAgg[0]?.totalFees ?? 0;
    const betCount = betFeeAgg[0]?.betCount ?? 0;

    // Deposit/withdrawal fees are NGN amounts — keep as NGN totals
    const depositFeeNGN = depositCount * DEPOSIT_FEE_NGN;
    const withdrawalFeeNGN = withdrawalCount * WITHDRAWAL_FEE_NGN;

    res.json({
      summary: {
        betFees: { totalUSD: totalBetFees, betCount },
        depositFees: { totalNGN: depositFeeNGN, txCount: depositCount, feePerTx: DEPOSIT_FEE_NGN },
        withdrawalFees: { totalNGN: withdrawalFeeNGN, txCount: withdrawalCount, feePerTx: WITHDRAWAL_FEE_NGN },
      },
      monthly: {
        betFees: betFeeMonthly.map((m) => ({ year: m._id.year, month: m._id.month, fees: m.fees, count: m.count })),
        deposits: depositMonthly.map((m) => ({ year: m._id.year, month: m._id.month, count: m.count, totalAmount: m.totalAmount })),
        withdrawals: withdrawalMonthly.map((m) => ({ year: m._id.year, month: m._id.month, count: m.count, totalAmount: m.totalAmount })),
        allTransactions: allTxMonthly.map((m) => ({ year: m._id.year, month: m._id.month, type: m._id.type, count: m.count, totalAmount: m.totalAmount })),
      },
      typeBreakdown: typeBreakdown.map((t) => ({ type: t._id || 'unknown', count: t.count, totalAmount: t.totalAmount })),
      distinctTypes,
    });
  } catch (err) {
    console.error('Cash flow summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
