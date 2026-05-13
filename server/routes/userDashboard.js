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

const BALANCE_BUCKETS = [
  { label: '$0',          min: 0,    max: 0 },
  { label: '$0.01–$5',    min: 0.01, max: 5 },
  { label: '$5–$20',      min: 5,    max: 20 },
  { label: '$20–$100',    min: 20,   max: 100 },
  { label: '$100+',       min: 100,  max: Infinity },
];

// ── GET /api/user-dashboard/summary ──────────────────────────────────────────

router.get('/summary', auth, async (req, res) => {
  try {
    const db = getDb();

    // Date range for time-series (signups, activity). Default: all-time.
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : null;
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const signupDateFilter = dateFrom
      ? { createdAt: { $gte: dateFrom, ...(dateTo ? { $lte: dateTo } : {}) } }
      : dateTo ? { createdAt: { $lte: dateTo } } : {};

    // ── Run all queries in parallel ───────────────────────────────────────────
    const [
      totalUsers,
      signupsDaily,
      signupsWeekly,
      signupsMonthly,
      depositedUserIds,
      bettingUserIds,
      topDepositors,
      walletAgg,
      topBettors,
      referralAgg,
      recentWithdrawals,
      pendingWithdrawals,
    ] = await Promise.all([

      // ── Total users (all-time) ───────────────────────────────────────────────
      db.collection('users').countDocuments(),

      // ── Signups daily ────────────────────────────────────────────────────────
      db.collection('users').aggregate([
        { $match: { ...signupDateFilter, createdAt: { $exists: true, ...(signupDateFilter.createdAt || {}) } } },
        { $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]).toArray(),

      // ── Signups weekly ───────────────────────────────────────────────────────
      db.collection('users').aggregate([
        { $match: { ...signupDateFilter, createdAt: { $exists: true, ...(signupDateFilter.createdAt || {}) } } },
        { $group: {
          _id: { year: { $isoWeekYear: '$createdAt' }, week: { $isoWeek: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]).toArray(),

      // ── Signups monthly ──────────────────────────────────────────────────────
      db.collection('users').aggregate([
        { $match: { ...signupDateFilter, createdAt: { $exists: true, ...(signupDateFilter.createdAt || {}) } } },
        { $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]).toArray(),

      // ── Distinct user IDs that have deposited (all-time for funnel) ──────────
      db.collection('transactions').distinct('user', DEPOSIT_FILTER),

      // ── Distinct user IDs that have participated in a bet ────────────────────
      db.collection('game_bet').aggregate([
        { $unwind: '$participants' },
        { $group: { _id: '$participants.user' } },
      ]).toArray(),

      // ── Top 10 depositors by total NGN sent ──────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: DEPOSIT_FILTER },
        { $group: {
          _id: '$user',
          totalNGN:   { $sum: '$gateWayResponse.data.amount' },
          totalUSD:   { $sum: '$amount' },
          txCount:    { $sum: 1 },
          lastDeposit: { $max: '$createdAt' },
        }},
        { $sort: { totalNGN: -1 } },
        { $limit: 10 },
      ]).toArray(),

      // ── Wallet balance aggregation for avg + distribution ────────────────────
      db.collection('walletusers').aggregate([
        { $group: {
          _id: null,
          totalBalance: { $sum: { $ifNull: ['$balance', 0] } },
          count:        { $sum: 1 },
          countZero:    { $sum: { $cond: [{ $lte: [{ $ifNull: ['$balance', 0] }, 0] }, 1, 0] } },
          countTier1:   { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 0] }, { $lte: ['$balance', 5] }]    }, 1, 0] } },
          countTier2:   { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 5] }, { $lte: ['$balance', 20] }]   }, 1, 0] } },
          countTier3:   { $sum: { $cond: [{ $and: [{ $gt: ['$balance', 20] }, { $lte: ['$balance', 100] }] }, 1, 0] } },
          countTier4:   { $sum: { $cond: [{ $gt: ['$balance', 100] }, 1, 0] } },
        }},
      ]).toArray(),

      // ── Top 10 bettors by participation count ────────────────────────────────
      db.collection('game_bet').aggregate([
        { $unwind: '$participants' },
        { $group: {
          _id:        '$participants.user',
          betCount:   { $sum: 1 },
          totalScore: { $sum: { $ifNull: ['$participants.currentScore', 0] } },
        }},
        { $sort: { betCount: -1 } },
        { $limit: 10 },
      ]).toArray(),

      // ── Referral stats ───────────────────────────────────────────────────────
      db.collection('referrals').aggregate([
        { $group: {
          _id: null,
          total: { $sum: 1 },
          // Count referrals where the referred user has a record (proxy for conversion)
        }},
      ]).toArray(),

      // ── Recent withdrawals (last 20) ─────────────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: WITHDRAWAL_FILTER },
        { $sort: { createdAt: -1 } },
        { $limit: 20 },
        { $project: { user: 1, amount: 1, status: 1, createdAt: 1, 'gateWayResponse.data.amount': 1 } },
      ]).toArray(),

      // ── Pending / processing withdrawals ─────────────────────────────────────
      db.collection('transactions').aggregate([
        { $match: { ...WITHDRAWAL_FILTER, status: { $regex: /pending|processing/i } } },
        { $group: {
          _id: null,
          count:    { $sum: 1 },
          totalUSD: { $sum: '$amount' },
        }},
      ]).toArray(),
    ]);

    // ── Resolve user display names ────────────────────────────────────────────
    const toOid = (id) => { try { return new ObjectId(id.toString()); } catch { return null; } };

    const depositorUserIds  = topDepositors.map((d) => d._id).filter(Boolean);
    const betterUserIds     = topBettors.map((b) => b._id).filter(Boolean);
    const withdrawalUserIds = recentWithdrawals.map((w) => w.user).filter(Boolean);

    const allUserIds = [...new Set([...depositorUserIds, ...betterUserIds, ...withdrawalUserIds].map(String))];
    const userDocs = allUserIds.length
      ? await db.collection('users').find(
          { _id: { $in: allUserIds.map(toOid).filter(Boolean) } },
          { projection: { username: 1, email: 1, displayName: 1, name: 1 } }
        ).toArray()
      : [];

    const userMap = {};
    userDocs.forEach((u) => {
      userMap[u._id.toString()] = u.username || u.displayName || u.name || u.email || u._id.toString();
    });

    // ── Idle depositors (deposited but never bet) ─────────────────────────────
    const bettingSet = new Set(bettingUserIds.map((b) => String(b._id)));
    const depositedSet = new Set(depositedUserIds.map(String));
    const idleCount = [...depositedSet].filter((id) => !bettingSet.has(id)).length;

    // ── Referral conversion ───────────────────────────────────────────────────
    // Check how many referred users have deposited
    const referralDocs = await db.collection('referrals').find(
      {}, { projection: { referee: 1, referredUser: 1, newUser: 1 } }
    ).limit(1000).toArray();

    const referredUserIds = referralDocs
      .map((r) => String(r.referee || r.referredUser || r.newUser))
      .filter(Boolean);
    const referredConverted = referredUserIds.filter((id) => depositedSet.has(id)).length;

    // ── Wallet stats ──────────────────────────────────────────────────────────
    const wallet = walletAgg[0] || {};
    const avgBalance = wallet.count > 0 ? (wallet.totalBalance ?? 0) / wallet.count : 0;

    // ── Build response ────────────────────────────────────────────────────────
    res.json({
      dateRange: {
        from: dateFrom ? dateFrom.toISOString().slice(0, 10) : null,
        to:   dateTo   ? dateTo.toISOString().slice(0, 10) : null,
      },

      // Tier 1
      funnel: {
        totalUsers,
        depositedUsers:  depositedSet.size,
        bettingUsers:    bettingSet.size,
        depositedPct:    totalUsers > 0 ? Math.round((depositedSet.size / totalUsers) * 100) : 0,
        bettingPct:      totalUsers > 0 ? Math.round((bettingSet.size / totalUsers) * 100) : 0,
        bettingOfDeposited: depositedSet.size > 0 ? Math.round((bettingSet.size / depositedSet.size) * 100) : 0,
      },

      signups: {
        daily:   signupsDaily.map((m) => ({ year: m._id.year, month: m._id.month, day: m._id.day, count: m.count })),
        weekly:  signupsWeekly.map((m) => ({ year: m._id.year, week: m._id.week, count: m.count })),
        monthly: signupsMonthly.map((m) => ({ year: m._id.year, month: m._id.month, count: m.count })),
      },

      topDepositors: topDepositors.map((d) => ({
        userId:      String(d._id),
        username:    userMap[String(d._id)] || String(d._id),
        totalNGN:    d.totalNGN,
        totalUSD:    d.totalUSD,
        txCount:     d.txCount,
        lastDeposit: d.lastDeposit,
      })),

      // Tier 2
      balanceDistribution: [
        { label: '$0',       count: wallet.countZero  ?? 0 },
        { label: '$0.01–$5', count: wallet.countTier1 ?? 0 },
        { label: '$5–$20',   count: wallet.countTier2 ?? 0 },
        { label: '$20–$100', count: wallet.countTier3 ?? 0 },
        { label: '$100+',    count: wallet.countTier4 ?? 0 },
      ],

      idleDepositors: {
        count:      idleCount,
        totalDeposited: depositedSet.size,
        pct: depositedSet.size > 0 ? Math.round((idleCount / depositedSet.size) * 100) : 0,
      },

      referrals: {
        total:         referralDocs.length,
        converted:     referredConverted,
        conversionRate: referralDocs.length > 0 ? Math.round((referredConverted / referralDocs.length) * 100) : 0,
      },

      // Tier 3
      walletStats: {
        totalWallets: wallet.count ?? 0,
        avgBalance,
        totalBalance: wallet.totalBalance ?? 0,
      },

      topBettors: topBettors.map((b) => ({
        userId:     String(b._id),
        username:   userMap[String(b._id)] || String(b._id),
        betCount:   b.betCount,
        totalScore: b.totalScore,
      })),

      recentWithdrawals: recentWithdrawals.map((w) => ({
        userId:   String(w.user),
        username: userMap[String(w.user)] || String(w.user),
        amountUSD: w.amount,
        ngnPaid:  w.gateWayResponse?.data?.amount ?? null,
        status:   w.status,
        createdAt: w.createdAt,
      })),

      pendingWithdrawals: {
        count:    pendingWithdrawals[0]?.count ?? 0,
        totalUSD: pendingWithdrawals[0]?.totalUSD ?? 0,
      },
    });
  } catch (err) {
    console.error('User dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
