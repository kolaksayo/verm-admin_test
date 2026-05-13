const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
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

const toOid = (id) => { try { return new ObjectId(id.toString()); } catch { return null; } };

async function resolveUsernames(db, ids) {
  const unique = [...new Set(ids.map(String))].filter(Boolean);
  if (!unique.length) return {};
  const docs = await db.collection('users').find(
    { _id: { $in: unique.map(toOid).filter(Boolean) } },
    { projection: { username: 1, displayName: 1, name: 1, email: 1 } }
  ).toArray();
  const map = {};
  docs.forEach((u) => {
    map[u._id.toString()] = u.username || u.displayName || u.name || u.email || u._id.toString();
  });
  return map;
}

// ── GET /api/user-dashboard/snapshot ─────────────────────────────────────────
// All-time platform state — no date filter.

router.get('/snapshot', auth, async (req, res) => {
  try {
    const db = getDb();

    const [
      totalUsers,
      depositedUserIds,
      bettingUserIds,
      walletAgg,
      referralDocs,
      pendingWithdrawals,
    ] = await Promise.all([

      db.collection('users').countDocuments(),

      db.collection('transactions').distinct('user', DEPOSIT_FILTER),

      db.collection('game_bet').aggregate([
        { $unwind: '$participants' },
        { $group: { _id: '$participants.user' } },
      ]).toArray(),

      db.collection('walletusers').aggregate([
        { $group: {
          _id: null,
          totalBalance: { $sum: { $ifNull: ['$balance', 0] } },
          count:        { $sum: 1 },
          countZero:  { $sum: { $cond: [{ $lte: [{ $ifNull: ['$balance', 0] }, 0]     }, 1, 0] } },
          countTier1: { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 0]   }, { $lte: ['$balance', 5]   }] }, 1, 0] } },
          countTier2: { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 5]   }, { $lte: ['$balance', 20]  }] }, 1, 0] } },
          countTier3: { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 20]  }, { $lte: ['$balance', 100] }] }, 1, 0] } },
          countTier4: { $sum: { $cond: [{ $gt: ['$balance', 100] }, 1, 0] } },
        }},
      ]).toArray(),

      db.collection('referrals').find(
        {}, { projection: { referee: 1, referredUser: 1, newUser: 1 } }
      ).limit(5000).toArray(),

      db.collection('transactions').aggregate([
        { $match: { ...WITHDRAWAL_FILTER, status: { $regex: /pending|processing/i } } },
        { $group: { _id: null, count: { $sum: 1 }, totalUSD: { $sum: '$amount' } } },
      ]).toArray(),
    ]);

    const depositedSet = new Set(depositedUserIds.map(String));
    const bettingSet   = new Set(bettingUserIds.map((b) => String(b._id)));
    const idleCount    = [...depositedSet].filter((id) => !bettingSet.has(id)).length;

    const referredIds = referralDocs.map((r) => String(r.referee || r.referredUser || r.newUser)).filter(Boolean);
    const referredConverted = referredIds.filter((id) => depositedSet.has(id)).length;

    const wallet = walletAgg[0] || {};
    const avgBalance = wallet.count > 0 ? (wallet.totalBalance ?? 0) / wallet.count : 0;

    res.json({
      funnel: {
        totalUsers,
        depositedUsers:        depositedSet.size,
        bettingUsers:          bettingSet.size,
        depositedPct:          totalUsers > 0 ? Math.round((depositedSet.size / totalUsers) * 100) : 0,
        bettingPct:            totalUsers > 0 ? Math.round((bettingSet.size / totalUsers) * 100) : 0,
        bettingOfDeposited:    depositedSet.size > 0 ? Math.round((bettingSet.size / depositedSet.size) * 100) : 0,
      },
      walletStats: {
        totalWallets: wallet.count ?? 0,
        avgBalance,
        totalBalance: wallet.totalBalance ?? 0,
      },
      balanceDistribution: [
        { label: '$0',        count: wallet.countZero  ?? 0 },
        { label: '$0.01–$5',  count: wallet.countTier1 ?? 0 },
        { label: '$5–$20',    count: wallet.countTier2 ?? 0 },
        { label: '$20–$100',  count: wallet.countTier3 ?? 0 },
        { label: '$100+',     count: wallet.countTier4 ?? 0 },
      ],
      idleDepositors: {
        count:  idleCount,
        total:  depositedSet.size,
        pct:    depositedSet.size > 0 ? Math.round((idleCount / depositedSet.size) * 100) : 0,
      },
      referrals: {
        total:          referralDocs.length,
        converted:      referredConverted,
        conversionRate: referralDocs.length > 0 ? Math.round((referredConverted / referralDocs.length) * 100) : 0,
      },
      pendingWithdrawals: {
        count:    pendingWithdrawals[0]?.count    ?? 0,
        totalUSD: pendingWithdrawals[0]?.totalUSD ?? 0,
      },
    });
  } catch (err) {
    console.error('User snapshot error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/user-dashboard/activity ─────────────────────────────────────────
// Date-filtered activity — signups, deposits, bets, withdrawals in period.

router.get('/activity', auth, async (req, res) => {
  try {
    const db = getDb();

    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : new Date('2026-03-01T00:00:00.000Z');
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const dateFilter = { createdAt: { $gte: dateFrom, ...(dateTo ? { $lte: dateTo } : {}) } };
    const depFilter  = { ...DEPOSIT_FILTER,    ...dateFilter };
    const witFilter  = { ...WITHDRAWAL_FILTER, ...dateFilter };
    const betFilter  = { ...dateFilter };

    const [
      signupsDaily, signupsWeekly, signupsMonthly,
      topDepositors,
      topBettors,
      recentWithdrawals,
      referralDocs,
      depositedUserIds,
    ] = await Promise.all([

      db.collection('users').aggregate([
        { $match: dateFilter },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]).toArray(),

      db.collection('users').aggregate([
        { $match: dateFilter },
        { $group: { _id: { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]).toArray(),

      db.collection('users').aggregate([
        { $match: dateFilter },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]).toArray(),

      db.collection('transactions').aggregate([
        { $match: depFilter },
        { $group: { _id: '$user', totalNGN: { $sum: '$gateWayResponse.data.amount' }, totalUSD: { $sum: '$amount' }, txCount: { $sum: 1 }, lastDeposit: { $max: '$createdAt' } } },
        { $sort: { totalNGN: -1 } },
        { $limit: 10 },
      ]).toArray(),

      db.collection('game_bet').aggregate([
        { $match: betFilter },
        { $unwind: '$participants' },
        { $group: { _id: '$participants.user', betCount: { $sum: 1 }, totalScore: { $sum: { $ifNull: ['$participants.currentScore', 0] } } } },
        { $sort: { betCount: -1 } },
        { $limit: 10 },
      ]).toArray(),

      db.collection('transactions').aggregate([
        { $match: witFilter },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
        { $project: { user: 1, amount: 1, status: 1, createdAt: 1, 'gateWayResponse.data.amount': 1 } },
      ]).toArray(),

      db.collection('referrals').find(
        dateFilter, { projection: { referee: 1, referredUser: 1, newUser: 1 } }
      ).limit(5000).toArray(),

      // All-time deposit set for referral conversion check
      db.collection('transactions').distinct('user', DEPOSIT_FILTER),
    ]);

    const depositedSet = new Set(depositedUserIds.map(String));
    const referredIds = referralDocs.map((r) => String(r.referee || r.referredUser || r.newUser)).filter(Boolean);
    const referredConverted = referredIds.filter((id) => depositedSet.has(id)).length;

    const allUserIds = [
      ...topDepositors.map((d) => d._id),
      ...topBettors.map((b) => b._id),
      ...recentWithdrawals.map((w) => w.user),
    ].filter(Boolean);
    const userMap = await resolveUsernames(db, allUserIds);

    res.json({
      dateRange: {
        from: dateFrom.toISOString().slice(0, 10),
        to:   dateTo ? dateTo.toISOString().slice(0, 10) : null,
      },
      signups: {
        daily:   signupsDaily.map((m)   => ({ year: m._id.year, month: m._id.month, day: m._id.day, count: m.count })),
        weekly:  signupsWeekly.map((m)  => ({ year: m._id.year, week: m._id.week,   count: m.count })),
        monthly: signupsMonthly.map((m) => ({ year: m._id.year, month: m._id.month, count: m.count })),
      },
      topDepositors: topDepositors.map((d) => ({
        userId: String(d._id), username: userMap[String(d._id)] || String(d._id),
        totalNGN: d.totalNGN, totalUSD: d.totalUSD, txCount: d.txCount, lastDeposit: d.lastDeposit,
      })),
      topBettors: topBettors.map((b) => ({
        userId: String(b._id), username: userMap[String(b._id)] || String(b._id),
        betCount: b.betCount, totalScore: b.totalScore,
      })),
      recentWithdrawals: recentWithdrawals.map((w) => ({
        userId: String(w.user), username: userMap[String(w.user)] || String(w.user),
        amountUSD: w.amount, ngnPaid: w.gateWayResponse?.data?.amount ?? null,
        status: w.status, createdAt: w.createdAt,
      })),
      referrals: {
        total:          referralDocs.length,
        converted:      referredConverted,
        conversionRate: referralDocs.length > 0 ? Math.round((referredConverted / referralDocs.length) * 100) : 0,
      },
    });
  } catch (err) {
    console.error('User activity error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
