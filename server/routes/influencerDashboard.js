const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { getBettingSet } = require('../utils/bettingSet');

const router = express.Router();

const DEPOSIT_FILTER = {
  type: { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

const toOid = (id) => { try { return new ObjectId(id.toString()); } catch { return null; } };

// GET /api/influencer-dashboard
// Returns per-influencer referral funnel stats (signed up → funded → bet).
// Optional: ?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD filters referral.createdAt.
router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();

    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : null;
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const dateFilter = dateFrom
      ? { createdAt: { $gte: dateFrom, ...(dateTo ? { $lte: dateTo } : {}) } }
      : dateTo
        ? { createdAt: { $lte: dateTo } }
        : {};

    // 1. All referral documents in the date window
    const referralDocs = await db.collection('referrals').find(
      dateFilter,
      { projection: { referrer: 1, referee: 1, referredUser: 1, newUser: 1, createdAt: 1 } }
    ).toArray();

    // Build map: referrerId → [{ refereeId, createdAt }]
    const referrerMap = {};
    for (const doc of referralDocs) {
      const referrerId = String(doc.referrer || '');
      const refereeId  = String(doc.referee || doc.referredUser || doc.newUser || '');
      if (!referrerId || !refereeId) continue;
      if (!referrerMap[referrerId]) referrerMap[referrerId] = [];
      referrerMap[referrerId].push({ refereeId, createdAt: doc.createdAt });
    }

    if (!Object.keys(referrerMap).length) {
      return res.json({
        summary: { totalInfluencers: 0, totalReferred: 0, totalFunded: 0, totalBet: 0 },
        influencers: [],
        dateRange: { from: dateFrom ? dateFrom.toISOString().slice(0, 10) : null, to: dateTo ? dateTo.toISOString().slice(0, 10) : null },
      });
    }

    const referrerIds = Object.keys(referrerMap);

    // 2. In parallel: funded set, betting set, referrer user docs
    const [fundedUserIds, bettingSet, referrerDocs] = await Promise.all([
      // All-time funded users (no date filter — a referee who funded later still counts)
      db.collection('transactions').distinct('user', DEPOSIT_FILTER),

      // All-time bettors = participants ∪ creators (see utils/bettingSet.js)
      getBettingSet(db),

      // Referrer user documents for display names + referral codes
      db.collection('users').find(
        { _id: { $in: referrerIds.map(toOid).filter(Boolean) } },
        { projection: { username: 1, displayName: 1, name: 1, referralCode: 1 } }
      ).toArray(),
    ]);

    const fundedSet  = new Set(fundedUserIds.map(String));

    const referrerDocMap = {};
    referrerDocs.forEach((u) => {
      referrerDocMap[u._id.toString()] = {
        username: u.username || u.displayName || u.name || u._id.toString(),
        referralCode: u.referralCode || null,
      };
    });

    // 3. Build per-influencer stats
    const influencers = referrerIds.map((referrerId) => {
      const entries  = referrerMap[referrerId];
      const refereeIds = entries.map((e) => e.refereeId);
      const dates    = entries.map((e) => e.createdAt).filter(Boolean).sort();
      const userInfo = referrerDocMap[referrerId] || { username: referrerId, referralCode: null };

      const referred = refereeIds.length;
      const funded   = refereeIds.filter((id) => fundedSet.has(id)).length;
      const bet      = refereeIds.filter((id) => bettingSet.has(id)).length;

      return {
        referrerId,
        username:       userInfo.username,
        referralCode:   userInfo.referralCode,
        referred,
        funded,
        bet,
        conversionRate: referred > 0 ? Math.round((bet / referred) * 1000) / 10 : 0,
        firstReferralAt: dates[0] || null,
        lastReferralAt:  dates[dates.length - 1] || null,
      };
    }).sort((a, b) => b.referred - a.referred);

    const summary = {
      totalInfluencers: influencers.length,
      totalReferred:    influencers.reduce((s, x) => s + x.referred, 0),
      totalFunded:      influencers.reduce((s, x) => s + x.funded,   0),
      totalBet:         influencers.reduce((s, x) => s + x.bet,      0),
    };

    res.json({
      summary,
      influencers,
      dateRange: {
        from: dateFrom ? dateFrom.toISOString().slice(0, 10) : null,
        to:   dateTo   ? dateTo.toISOString().slice(0, 10)   : null,
      },
    });
  } catch (err) {
    console.error('Influencer dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
