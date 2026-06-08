const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');
const { requireEditMode } = require('../middleware/auth');

const router = express.Router();

function getSetting(sqlite, key, def) {
  const row = sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
  return row ? row.value : def;
}

function setSetting(sqlite, key, value) {
  sqlite.prepare(`
    INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

// GET /api/influencer-dashboard/settings
router.get('/settings', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const showFunnel   = getSetting(sqlite, 'influencer_show_funnel',   'true')  === 'true';
    const showEarnings = getSetting(sqlite, 'influencer_show_earnings',  'false') === 'true';
    const rates = sqlite.prepare('SELECT referral_code, rate, notes FROM influencer_rates').all()
      .reduce((m, r) => { m[r.referral_code] = { rate: r.rate, notes: r.notes }; return m; }, {});
    res.json({ showFunnel, showEarnings, rates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/influencer-dashboard/settings
router.post('/settings', auth, requireEditMode, (req, res) => {
  try {
    const sqlite = getSQLite();
    const { showFunnel, showEarnings } = req.body;
    if (showFunnel   !== undefined) setSetting(sqlite, 'influencer_show_funnel',   showFunnel   ? 'true' : 'false');
    if (showEarnings !== undefined) setSetting(sqlite, 'influencer_show_earnings', showEarnings ? 'true' : 'false');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/influencer-dashboard/rates/:referralCode
router.post('/rates/:referralCode', auth, requireEditMode, (req, res) => {
  try {
    const sqlite = getSQLite();
    const code   = req.params.referralCode.toUpperCase();
    const rate   = parseFloat(req.body.rate);
    const notes  = req.body.notes ? String(req.body.notes).slice(0, 200) : null;
    if (isNaN(rate) || rate < 0) return res.status(400).json({ error: 'Invalid rate' });
    sqlite.prepare(`
      INSERT INTO influencer_rates (referral_code, rate, notes, updated_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(referral_code) DO UPDATE SET rate = excluded.rate, notes = excluded.notes, updated_at = excluded.updated_at
    `).run(code, rate, notes);
    res.json({ ok: true, referralCode: code, rate, notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const [fundedUserIds, bettingParticipants, bettingCreators, referrerDocs] = await Promise.all([
      // All-time funded users (no date filter — a referee who funded later still counts)
      db.collection('transactions').distinct('user', DEPOSIT_FILTER),

      // All users who participated in any bet (via participants.user)
      db.collection('game_bet').aggregate([
        { $unwind: '$participants' },
        { $group: { _id: '$participants.user' } },
      ]).toArray(),

      // All users who created a bet
      db.collection('game_bet').distinct('createdBy'),

      // Referrer user documents for display names + referral codes
      db.collection('users').find(
        { _id: { $in: referrerIds.map(toOid).filter(Boolean) } },
        { projection: { username: 1, displayName: 1, name: 1, referralCode: 1 } }
      ).toArray(),
    ]);

    const fundedSet  = new Set(fundedUserIds.map(String));
    const bettingSet = new Set([
      ...bettingParticipants.map((b) => String(b._id)),
      ...bettingCreators.map(String),
    ]);

    const referrerDocMap = {};
    referrerDocs.forEach((u) => {
      referrerDocMap[u._id.toString()] = {
        username: u.username || u.displayName || u.name || u._id.toString(),
        referralCode: u.referralCode || null,
      };
    });

    // Load per-influencer rates from SQLite
    const rateMap = getSQLite().prepare('SELECT referral_code, rate FROM influencer_rates').all()
      .reduce((m, r) => { m[r.referral_code] = { rate: r.rate }; return m; }, {});

    // 3. Build per-influencer stats
    const influencers = referrerIds.map((referrerId) => {
      const entries  = referrerMap[referrerId];
      const refereeIds = entries.map((e) => e.refereeId);
      const dates    = entries.map((e) => e.createdAt).filter(Boolean).sort();
      const userInfo = referrerDocMap[referrerId] || { username: referrerId, referralCode: null };

      const referred = refereeIds.length;
      const funded   = refereeIds.filter((id) => fundedSet.has(id)).length;
      const bet      = refereeIds.filter((id) => bettingSet.has(id)).length;

      const rateCode = (userInfo.referralCode || '').toUpperCase();
      const rateRow  = rateCode ? rateMap[rateCode] : null;
      const rate     = rateRow?.rate ?? 0;

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
        rate,
        earnings: rate * bet,
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
