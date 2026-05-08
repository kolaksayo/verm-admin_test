const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Safehaven NGN top-up: type CREDIT, description "TOP UP", gateway amount present
const DEPOSIT_FILTER = {
  type: { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

// Safehaven NGN withdrawal: type DEBIT, description contains "WITHDRAW"
// (confirmed pattern once withdrawal doc is seen — using broad match for now)
const WITHDRAWAL_FILTER = {
  type: { $regex: /^DEBIT$/i },
  description: { $regex: /withdraw/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

// Fee per USD credited/withdrawn (expressed in NGN)
const DEPOSIT_FEE_PER_USD = 100;   // platform adds 100 NGN to rate → fee = usd_credited × 100
const WITHDRAWAL_FEE_PER_USD = 200; // platform deducts 200 NGN from rate → fee = usd_withdrawn × 200

// ── GET /api/cashflow/summary ──────────────────────────────────────────────────

router.get('/summary', auth, async (req, res) => {
  try {
    const db = getDb();

    // ── 1. Bet fee revenue ────────────────────────────────────────────────────
    const betFeeAgg = await db.collection('game_bet').aggregate([
      { $match: { totalFeesDeducted: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, totalFees: { $sum: '$totalFeesDeducted' }, betCount: { $sum: 1 } } },
    ]).toArray();

    const betFeeMonthly = await db.collection('game_bet').aggregate([
      { $match: { totalFeesDeducted: { $exists: true, $gt: 0 }, createdAt: { $exists: true } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        fees: { $sum: '$totalFeesDeducted' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 2. Deposit fee revenue ────────────────────────────────────────────────
    // fee = amount (USD credited) × 100 NGN  (platform adds 100 NGN to exchange rate)
    // NGN sent by user = gateWayResponse.data.amount
    // implied rate = gateWayResponse.data.amount / amount
    const depositAgg = await db.collection('transactions').aggregate([
      { $match: DEPOSIT_FILTER },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        totalUSD: { $sum: '$amount' },
        totalNGN: { $sum: '$gateWayResponse.data.amount' },
        feeNGN: { $sum: { $multiply: ['$amount', DEPOSIT_FEE_PER_USD] } },
        avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
      }},
    ]).toArray();

    const depositMonthly = await db.collection('transactions').aggregate([
      { $match: { ...DEPOSIT_FILTER, createdAt: { $exists: true } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
        totalUSD: { $sum: '$amount' },
        totalNGN: { $sum: '$gateWayResponse.data.amount' },
        feeNGN: { $sum: { $multiply: ['$amount', DEPOSIT_FEE_PER_USD] } },
        avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 3. Withdrawal fee revenue ─────────────────────────────────────────────
    // fee = amount (USD withdrawn) × 200 NGN  (platform deducts 200 NGN from exchange rate)
    const withdrawalAgg = await db.collection('transactions').aggregate([
      { $match: WITHDRAWAL_FILTER },
      { $group: {
        _id: null,
        count: { $sum: 1 },
        totalUSD: { $sum: '$amount' },
        totalNGN: { $sum: '$gateWayResponse.data.amount' },
        feeNGN: { $sum: { $multiply: ['$amount', WITHDRAWAL_FEE_PER_USD] } },
        avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
      }},
    ]).toArray();

    const withdrawalMonthly = await db.collection('transactions').aggregate([
      { $match: { ...WITHDRAWAL_FILTER, createdAt: { $exists: true } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
        totalUSD: { $sum: '$amount' },
        totalNGN: { $sum: '$gateWayResponse.data.amount' },
        feeNGN: { $sum: { $multiply: ['$amount', WITHDRAWAL_FEE_PER_USD] } },
        avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 4. Transaction type breakdown ─────────────────────────────────────────
    const typeBreakdown = await db.collection('transactions').aggregate([
      { $group: {
        _id: { type: '$type', description: '$description' },
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      }},
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]).toArray();

    const distinctTypes = await db.collection('transactions').distinct('type');

    // ── Build response ────────────────────────────────────────────────────────
    const dep = depositAgg[0] || {};
    const wit = withdrawalAgg[0] || {};
    const bet = betFeeAgg[0] || {};

    res.json({
      summary: {
        betFees: {
          totalUSD: bet.totalFees ?? 0,
          betCount: bet.betCount ?? 0,
        },
        depositFees: {
          txCount: dep.count ?? 0,
          totalUSD: dep.totalUSD ?? 0,
          totalNGN: dep.totalNGN ?? 0,
          feeNGN: dep.feeNGN ?? 0,
          avgRateCharged: dep.avgRateCharged ?? null,
          feePerUSD: DEPOSIT_FEE_PER_USD,
        },
        withdrawalFees: {
          txCount: wit.count ?? 0,
          totalUSD: wit.totalUSD ?? 0,
          totalNGN: wit.totalNGN ?? 0,
          feeNGN: wit.feeNGN ?? 0,
          avgRateCharged: wit.avgRateCharged ?? null,
          feePerUSD: WITHDRAWAL_FEE_PER_USD,
        },
      },
      monthly: {
        betFees: betFeeMonthly.map((m) => ({
          year: m._id.year, month: m._id.month, fees: m.fees, count: m.count,
        })),
        deposits: depositMonthly.map((m) => ({
          year: m._id.year, month: m._id.month,
          count: m.count, totalUSD: m.totalUSD, totalNGN: m.totalNGN,
          feeNGN: m.feeNGN, avgRateCharged: m.avgRateCharged,
        })),
        withdrawals: withdrawalMonthly.map((m) => ({
          year: m._id.year, month: m._id.month,
          count: m.count, totalUSD: m.totalUSD, totalNGN: m.totalNGN,
          feeNGN: m.feeNGN, avgRateCharged: m.avgRateCharged,
        })),
      },
      typeBreakdown: typeBreakdown.map((t) => ({
        type: t._id?.type || 'unknown',
        description: t._id?.description || '',
        count: t.count,
        totalAmount: t.totalAmount,
      })),
      distinctTypes,
    });
  } catch (err) {
    console.error('Cash flow summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
