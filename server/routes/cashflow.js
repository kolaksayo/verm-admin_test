const express = require('express');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');

const router = express.Router();

const DEPOSIT_FILTER = {
  type: { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

const WITHDRAWAL_FILTER = {
  type: { $regex: /^DEBIT$/i },
  description: { $regex: /safehaven naira transfer/i },
};

const DEPOSIT_FEE_PER_USD    = 100;
const WITHDRAWAL_FEE_PER_USD = 200;

// Reusable withdrawal group fields
function witGroupFields() {
  return {
    count:            { $sum: 1 },
    totalUSD:         { $sum: '$amount' },
    totalNGNGateway:  { $sum: { $ifNull: ['$gateWayResponse.data.amount', 0] } },
    withGatewayCount: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$gateWayResponse.data.amount', 0] }, 0] }, 1, 0] } },
    feeNGN:           { $sum: { $multiply: ['$amount', WITHDRAWAL_FEE_PER_USD] } },
    avgRatePaid: {
      $avg: {
        $cond: [
          { $gt: [{ $ifNull: ['$gateWayResponse.data.amount', 0] }, 0] },
          { $divide: ['$gateWayResponse.data.amount', '$amount'] },
          null,
        ],
      },
    },
  };
}

function depGroupFields() {
  return {
    count:          { $sum: 1 },
    totalUSD:       { $sum: '$amount' },
    totalNGN:       { $sum: '$gateWayResponse.data.amount' },
    feeNGN:         { $sum: { $multiply: ['$amount', DEPOSIT_FEE_PER_USD] } },
    avgRateCharged: { $avg: { $divide: ['$gateWayResponse.data.amount', '$amount'] } },
  };
}

// ── GET /api/cashflow/summary ──────────────────────────────────────────────────

router.get('/summary', auth, async (req, res) => {
  try {
    const db = getDb();

    const dateFrom = req.query.dateFrom
      ? new Date(req.query.dateFrom + 'T00:00:00.000Z')
      : new Date('2026-03-01T00:00:00.000Z');
    const dateTo = req.query.dateTo
      ? new Date(req.query.dateTo + 'T23:59:59.999Z')
      : null;

    const dateFilter = { createdAt: { $gte: dateFrom, ...(dateTo ? { $lte: dateTo } : {}) } };
    const betDateFilter = { createdAt: { $gte: dateFrom, ...(dateTo ? { $lte: dateTo } : {}), $exists: true } };

    const depFilter = { ...DEPOSIT_FILTER, ...dateFilter };
    const witFilter = { ...WITHDRAWAL_FILTER, ...dateFilter };

    // ── Run all aggregations in parallel ─────────────────────────────────────
    const [
      depositAgg, withdrawalAgg, betFeeAgg,
      depDaily, witDaily,
      depWeekly, witWeekly,
      depMonthly, witMonthly,
      betFeeDaily, betFeeWeekly, betFeeMonthly,
      typeBreakdown, distinctTypes,
    ] = await Promise.all([

      // ── Totals ──────────────────────────────────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: depFilter },
        { $group: { _id: null, ...depGroupFields(),
          bankFeesNGN: { $sum: { $add: [
            { $ifNull: ['$gateWayResponse.data.fees', 0] },
            { $ifNull: ['$gateWayResponse.data.vat', 0] },
            { $ifNull: ['$gateWayResponse.data.stampDuty', 0] },
          ]}},
        }},
      ]).toArray(),

      db.collection('transactions').aggregate([
        { $match: witFilter },
        { $group: { _id: null, ...witGroupFields() } },
      ]).toArray(),

      db.collection('game_bet').aggregate([
        { $match: { totalFeesDeducted: { $exists: true, $gt: 0 }, ...betDateFilter } },
        { $group: { _id: null, totalFees: { $sum: '$totalFeesDeducted' }, betCount: { $sum: 1 } } },
      ]).toArray(),

      // ── Daily ───────────────────────────────────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: depFilter },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }, ...depGroupFields() } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]).toArray(),

      db.collection('transactions').aggregate([
        { $match: witFilter },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }, ...witGroupFields() } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]).toArray(),

      // ── Weekly ──────────────────────────────────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: depFilter },
        { $group: { _id: { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } }, ...depGroupFields() } },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]).toArray(),

      db.collection('transactions').aggregate([
        { $match: witFilter },
        { $group: { _id: { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } }, ...witGroupFields() } },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]).toArray(),

      // ── Monthly ─────────────────────────────────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: depFilter },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, ...depGroupFields() } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]).toArray(),

      db.collection('transactions').aggregate([
        { $match: witFilter },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, ...witGroupFields() } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]).toArray(),

      // ── Bet fee time series ──────────────────────────────────────────────────
      db.collection('game_bet').aggregate([
        { $match: { totalFeesDeducted: { $exists: true, $gt: 0 }, ...betDateFilter } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }, fees: { $sum: '$totalFeesDeducted' }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]).toArray(),

      db.collection('game_bet').aggregate([
        { $match: { totalFeesDeducted: { $exists: true, $gt: 0 }, ...betDateFilter } },
        { $group: { _id: { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } }, fees: { $sum: '$totalFeesDeducted' }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]).toArray(),

      db.collection('game_bet').aggregate([
        { $match: { totalFeesDeducted: { $exists: true, $gt: 0 }, ...betDateFilter } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, fees: { $sum: '$totalFeesDeducted' }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]).toArray(),

      // ── Type breakdown ───────────────────────────────────────────────────────
      db.collection('transactions').aggregate([
        { $group: { _id: { type: '$type', description: '$description' }, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]).toArray(),

      db.collection('transactions').distinct('type'),
    ]);

    // ── Admin credits from SQLite ─────────────────────────────────────────────
    let adminCredits = { count: 0, totalUSD: 0, daily: [], weekly: [], monthly: [] };
    try {
      const sqlite = getSQLite();
      const acFrom = dateFrom.toISOString().slice(0, 19).replace('T', ' ');
      const acTo   = dateTo ? dateTo.toISOString().slice(0, 19).replace('T', ' ') : null;
      const acWhere = acTo
        ? `created_at >= '${acFrom}' AND created_at <= '${acTo}'`
        : `created_at >= '${acFrom}'`;

      const acTotal = sqlite.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM admin_credits WHERE ${acWhere}`
      ).get();
      adminCredits.count    = acTotal.cnt;
      adminCredits.totalUSD = acTotal.total;

      const acDaily = sqlite.prepare(
        `SELECT strftime('%Y', created_at) as year,
                strftime('%m', created_at) as month,
                strftime('%d', created_at) as day,
                COUNT(*) as count, SUM(amount) as totalUSD
           FROM admin_credits WHERE ${acWhere}
           GROUP BY year, month, day ORDER BY year, month, day`
      ).all();
      adminCredits.daily = acDaily.map((r) => ({
        year: +r.year, month: +r.month, day: +r.day, count: r.count, totalUSD: r.totalUSD,
      }));

      const acMonthly = sqlite.prepare(
        `SELECT strftime('%Y', created_at) as year,
                strftime('%m', created_at) as month,
                COUNT(*) as count, SUM(amount) as totalUSD
           FROM admin_credits WHERE ${acWhere}
           GROUP BY year, month ORDER BY year, month`
      ).all();
      adminCredits.monthly = acMonthly.map((r) => ({
        year: +r.year, month: +r.month, count: r.count, totalUSD: r.totalUSD,
      }));
    } catch { /* non-fatal */ }

    // ── Bank balance ──────────────────────────────────────────────────────────
    const dep  = depositAgg[0] || {};
    const wit  = withdrawalAgg[0] || {};
    const bet  = betFeeAgg[0] || {};

    const totalDepNGN  = dep.totalNGN ?? 0;
    const totalDepFees = dep.bankFeesNGN ?? 0;
    const netDepNGN    = totalDepNGN - totalDepFees;
    const avgDepRate   = dep.avgRateCharged ?? 0;
    const estWitRate   = Math.max(avgDepRate - WITHDRAWAL_FEE_PER_USD - DEPOSIT_FEE_PER_USD, 0);
    const witGatewayNGN      = wit.totalNGNGateway ?? 0;
    const witGatewayCount    = wit.withGatewayCount ?? 0;
    const witTotalCount      = wit.count ?? 0;
    const witNoGatewayUSD    = witTotalCount - witGatewayCount > 0
      ? (wit.totalUSD ?? 0) * (witTotalCount - witGatewayCount) / Math.max(witTotalCount, 1)
      : 0;
    const estWithdrawalNGN   = witGatewayNGN + witNoGatewayUSD * estWitRate;
    const estBankBalanceNGN  = netDepNGN - estWithdrawalNGN;

    // ── Serialisers ───────────────────────────────────────────────────────────
    const serDep = (m) => ({
      ...('year' in (m._id || {}) && 'month' in m._id ? { year: m._id.year, month: m._id.month } : {}),
      ...('day'  in (m._id || {}) ? { day: m._id.day }   : {}),
      ...('week' in (m._id || {}) ? { week: m._id.week, year: m._id.year } : {}),
      count: m.count, totalUSD: m.totalUSD, totalNGN: m.totalNGN,
      feeNGN: m.feeNGN, avgRateCharged: m.avgRateCharged,
    });
    const serWit = (m) => ({
      ...('year' in (m._id || {}) && 'month' in m._id ? { year: m._id.year, month: m._id.month } : {}),
      ...('day'  in (m._id || {}) ? { day: m._id.day }   : {}),
      ...('week' in (m._id || {}) ? { week: m._id.week, year: m._id.year } : {}),
      count: m.count, totalUSD: m.totalUSD, totalNGNGateway: m.totalNGNGateway,
      feeNGN: m.feeNGN, avgRatePaid: m.avgRatePaid,
    });
    const serBet = (m) => ({
      ...('year' in (m._id || {}) && 'month' in m._id ? { year: m._id.year, month: m._id.month } : {}),
      ...('day'  in (m._id || {}) ? { day: m._id.day }   : {}),
      ...('week' in (m._id || {}) ? { week: m._id.week, year: m._id.year } : {}),
      fees: m.fees, count: m.count,
    });

    res.json({
      dateRange: {
        from: dateFrom.toISOString().slice(0, 10),
        to:   dateTo ? dateTo.toISOString().slice(0, 10) : null,
      },
      summary: {
        depositFees: {
          txCount: dep.count ?? 0, totalUSD: dep.totalUSD ?? 0,
          totalNGN: totalDepNGN, bankFeesNGN: totalDepFees, netDepNGN,
          feeNGN: dep.feeNGN ?? 0, avgRateCharged: dep.avgRateCharged ?? null,
          feePerUSD: DEPOSIT_FEE_PER_USD,
        },
        withdrawalFees: {
          txCount: wit.count ?? 0, totalUSD: wit.totalUSD ?? 0,
          totalNGNGateway: witGatewayNGN, withGatewayCount: witGatewayCount,
          feeNGN: wit.feeNGN ?? 0, avgRatePaid: wit.avgRatePaid ?? null,
          feePerUSD: WITHDRAWAL_FEE_PER_USD, estimatedNGNOut: estWithdrawalNGN,
        },
        betFees: {
          totalUSD: bet.totalFees ?? 0,
          betCount: bet.betCount ?? 0,
        },
        adminCredits: {
          count: adminCredits.count,
          totalUSD: adminCredits.totalUSD,
        },
        bankBalance: {
          totalDepositNGN: totalDepNGN, bankFeesOnDeposits: totalDepFees,
          netDepositNGN: netDepNGN, estimatedWithdrawalNGN: estWithdrawalNGN,
          estimatedBalanceNGN: estBankBalanceNGN,
        },
      },
      daily: {
        deposits: depDaily.map(serDep),
        withdrawals: witDaily.map(serWit),
        betFees: betFeeDaily.map(serBet),
        adminCredits: adminCredits.daily,
      },
      weekly: {
        deposits: depWeekly.map(serDep),
        withdrawals: witWeekly.map(serWit),
        betFees: betFeeWeekly.map(serBet),
        adminCredits: [],
      },
      monthly: {
        deposits: depMonthly.map(serDep),
        withdrawals: witMonthly.map(serWit),
        betFees: betFeeMonthly.map(serBet),
        adminCredits: adminCredits.monthly,
      },
      typeBreakdown: typeBreakdown.map((t) => ({
        type: t._id?.type || 'unknown',
        description: t._id?.description || '',
        count: t.count, totalAmount: t.totalAmount,
      })),
      distinctTypes,
    });
  } catch (err) {
    console.error('Cash flow summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
