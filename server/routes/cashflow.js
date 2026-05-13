const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Safehaven NGN top-up — gateway data confirmed present on deposits
const DEPOSIT_FILTER = {
  type: { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

// Safehaven NGN withdrawal — description is "SafeHaven Naira transfer"
// fee = USD withdrawn × 200 NGN  (platform deducts 200 NGN from exchange rate)
// gateWayResponse.data.amount = NGN actually sent to customer (already at reduced rate)
const WITHDRAWAL_FILTER = {
  type: { $regex: /^DEBIT$/i },
  description: { $regex: /safehaven naira transfer/i },
};

const DEPOSIT_FEE_PER_USD   = 100;  // platform adds    100 NGN to rate → fee = USD_credited  × 100
const WITHDRAWAL_FEE_PER_USD = 200; // platform deducts 200 NGN from rate → fee = USD_withdrawn × 200

// ── GET /api/cashflow/summary ──────────────────────────────────────────────────

router.get('/summary', auth, async (req, res) => {
  try {
    const db = getDb();

    // Optional date range — default dateFrom to 2026-03-01 (real data start)
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : new Date('2026-03-01T00:00:00.000Z');
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const dateFilter = { createdAt: { $gte: dateFrom, ...(dateTo ? { $lte: dateTo } : {}) } };

    const depFilter = { ...DEPOSIT_FILTER,    ...dateFilter };
    const witFilter = { ...WITHDRAWAL_FILTER, ...dateFilter };

    // ── 1. Deposit aggregation ────────────────────────────────────────────────
    // NGN sent = gateWayResponse.data.amount
    // USD credited = amount
    // Platform fee = amount × 100 NGN
    // Implied rate = gateWayResponse.data.amount / amount
    const depositAgg = await db.collection('transactions').aggregate([
      { $match: depFilter },
      { $group: {
        _id: null,
        count:          { $sum: 1 },
        totalUSD:       { $sum: '$amount' },
        totalNGN:       { $sum: '$gateWayResponse.data.amount' },
        feeNGN:         { $sum: { $multiply: ['$amount', DEPOSIT_FEE_PER_USD] } },
        bankFeesNGN:    { $sum: { $add: [
          { $ifNull: ['$gateWayResponse.data.fees', 0] },
          { $ifNull: ['$gateWayResponse.data.vat', 0] },
          { $ifNull: ['$gateWayResponse.data.stampDuty', 0] },
        ]}},
        avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
      }},
    ]).toArray();

    const depositMonthly = await db.collection('transactions').aggregate([
      { $match: depFilter },
      { $group: {
        _id:            { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count:          { $sum: 1 },
        totalUSD:       { $sum: '$amount' },
        totalNGN:       { $sum: '$gateWayResponse.data.amount' },
        feeNGN:         { $sum: { $multiply: ['$amount', DEPOSIT_FEE_PER_USD] } },
        avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 2. Withdrawal aggregation ─────────────────────────────────────────────
    // USD withdrawn = amount
    // NGN paid out  = gateWayResponse.data.amount if present, else amount × (avgDepRate - 200)
    // Platform fee  = amount × 200 NGN (no gateway data needed)
    const withdrawalAgg = await db.collection('transactions').aggregate([
      { $match: witFilter },
      { $group: {
        _id: null,
        count:     { $sum: 1 },
        totalUSD:  { $sum: '$amount' },
        // NGN paid out via gateway when available
        totalNGNGateway: { $sum: { $ifNull: ['$gateWayResponse.data.amount', 0] } },
        withGatewayCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$gateWayResponse.data.amount', 0] }, 0] }, 1, 0] } },
        feeNGN:    { $sum: { $multiply: ['$amount', WITHDRAWAL_FEE_PER_USD] } },
        avgRatePaid: {
          $avg: {
            $cond: [
              { $gt: [{ $ifNull: ['$gateWayResponse.data.amount', 0] }, 0] },
              { $divide: ['$gateWayResponse.data.amount', '$amount'] },
              null,
            ],
          },
        },
      }},
    ]).toArray();

    const withdrawalMonthly = await db.collection('transactions').aggregate([
      { $match: witFilter },
      { $group: {
        _id:       { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count:     { $sum: 1 },
        totalUSD:  { $sum: '$amount' },
        totalNGNGateway: { $sum: { $ifNull: ['$gateWayResponse.data.amount', 0] } },
        feeNGN:    { $sum: { $multiply: ['$amount', WITHDRAWAL_FEE_PER_USD] } },
        avgRatePaid: {
          $avg: {
            $cond: [
              { $gt: [{ $ifNull: ['$gateWayResponse.data.amount', 0] }, 0] },
              { $divide: ['$gateWayResponse.data.amount', '$amount'] },
              null,
            ],
          },
        },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]).toArray();

    // ── 3. Transaction type breakdown (for diagnostics) ───────────────────────
    const typeBreakdown = await db.collection('transactions').aggregate([
      { $group: {
        _id:         { type: '$type', description: '$description' },
        count:       { $sum: 1 },
        totalAmount: { $sum: '$amount' },
      }},
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]).toArray();

    const distinctTypes = await db.collection('transactions').distinct('type');

    // ── 4. Bank balance estimate ──────────────────────────────────────────────
    const dep = depositAgg[0] || {};
    const wit = withdrawalAgg[0] || {};

    const totalDepNGN    = dep.totalNGN ?? 0;
    const totalDepFees   = dep.bankFeesNGN ?? 0;
    const netDepNGN      = totalDepNGN - totalDepFees;

    // For NGN paid out: use gateway NGN if available; otherwise estimate using
    // (avgDepositRate − 200) as a proxy for the withdrawal rate used.
    const avgDepRate     = dep.avgRateCharged ?? 0;
    const estimatedWithdrawalRate = Math.max(avgDepRate - WITHDRAWAL_FEE_PER_USD - DEPOSIT_FEE_PER_USD, 0);
    const witGatewayNGN  = wit.totalNGNGateway ?? 0;
    const witGatewayCount = wit.withGatewayCount ?? 0;
    const witTotalCount  = wit.count ?? 0;
    const witNoGatewayUSD = (witTotalCount - witGatewayCount > 0)
      ? ((wit.totalUSD ?? 0) * (witTotalCount - witGatewayCount) / Math.max(witTotalCount, 1))
      : 0;
    const estimatedWithdrawalNGN = witGatewayNGN + (witNoGatewayUSD * estimatedWithdrawalRate);
    const estimatedBankBalanceNGN = netDepNGN - estimatedWithdrawalNGN;

    res.json({
      dateRange: {
        from: dateFrom.toISOString().slice(0, 10),
        to:   dateTo ? dateTo.toISOString().slice(0, 10) : null,
      },
      summary: {
        depositFees: {
          txCount:        dep.count ?? 0,
          totalUSD:       dep.totalUSD ?? 0,
          totalNGN:       totalDepNGN,
          bankFeesNGN:    totalDepFees,
          netDepNGN,
          feeNGN:         dep.feeNGN ?? 0,
          avgRateCharged: dep.avgRateCharged ?? null,
          feePerUSD:      DEPOSIT_FEE_PER_USD,
        },
        withdrawalFees: {
          txCount:         wit.count ?? 0,
          totalUSD:        wit.totalUSD ?? 0,
          totalNGNGateway: witGatewayNGN,
          withGatewayCount: witGatewayCount,
          feeNGN:          wit.feeNGN ?? 0,
          avgRatePaid:     wit.avgRatePaid ?? null,
          feePerUSD:       WITHDRAWAL_FEE_PER_USD,
          estimatedNGNOut: estimatedWithdrawalNGN,
        },
        bankBalance: {
          totalDepositNGN:       totalDepNGN,
          bankFeesOnDeposits:    totalDepFees,
          netDepositNGN:         netDepNGN,
          estimatedWithdrawalNGN,
          estimatedBalanceNGN:   estimatedBankBalanceNGN,
          withdrawalNGNFromGateway: witGatewayNGN,
          withdrawalNGNEstimated:   estimatedWithdrawalNGN - witGatewayNGN,
        },
      },
      monthly: {
        deposits: depositMonthly.map((m) => ({
          year: m._id.year, month: m._id.month,
          count: m.count, totalUSD: m.totalUSD, totalNGN: m.totalNGN,
          feeNGN: m.feeNGN, avgRateCharged: m.avgRateCharged,
        })),
        withdrawals: withdrawalMonthly.map((m) => ({
          year: m._id.year, month: m._id.month,
          count: m.count, totalUSD: m.totalUSD,
          totalNGNGateway: m.totalNGNGateway,
          feeNGN: m.feeNGN, avgRatePaid: m.avgRatePaid,
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
