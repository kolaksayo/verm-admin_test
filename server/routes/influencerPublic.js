const express = require('express');
const bcrypt  = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');

const router = express.Router();

const DEPOSIT_FILTER = {
  type: { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

const toOid = (id) => { try { return new ObjectId(id.toString()); } catch { return null; } };

function getSetting(sqlite, key, defaultVal) {
  const row = sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
  return row ? row.value : defaultVal;
}

async function getBetCount(db, refereeIds) {
  if (!refereeIds.length) return 0;
  const refereeOids = refereeIds.map(toOid).filter(Boolean);
  const [bettingParticipants, bettingCreators] = await Promise.all([
    db.collection('game_bet').aggregate([
      { $match: { 'participants.user': { $in: refereeOids } } },
      { $unwind: '$participants' },
      { $match: { 'participants.user': { $in: refereeOids } } },
      { $group: { _id: '$participants.user' } },
    ]).toArray(),
    db.collection('game_bet').distinct('createdBy', { createdBy: { $in: refereeOids } }),
  ]);
  const bettingSet = new Set([
    ...bettingParticipants.map((b) => String(b._id)),
    ...bettingCreators.map(String),
  ]);
  return refereeIds.filter((id) => bettingSet.has(id)).length;
}

// GET /api/influencer-public?code=REFERRALCODE
router.get('/', async (req, res) => {
  try {
    const code = (req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Referral code required' });

    const db     = getDb();
    const sqlite = getSQLite();

    // Load admin visibility settings
    const showFunnel   = getSetting(sqlite, 'influencer_show_funnel',   'true') === 'true';
    const showEarnings = getSetting(sqlite, 'influencer_show_earnings',  'false') === 'true';

    // Find the user who owns this referral code
    const user = await db.collection('users').findOne(
      { referralCode: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      { projection: { _id: 1, username: 1, name: 1, referralCode: 1 } },
    );
    if (!user) return res.status(404).json({ error: 'Referral code not found' });

    const referrerId    = user._id.toString();
    const referralCode  = user.referralCode || code;

    // All referrals where this user is the referrer
    const referralDocs = await db.collection('referrals').find(
      { referrer: toOid(referrerId) },
      { projection: { referee: 1, referredUser: 1, newUser: 1 } },
    ).toArray();

    const refereeIds = referralDocs.map((d) =>
      String(d.referee || d.referredUser || d.newUser || '')
    ).filter(Boolean);

    const referred = refereeIds.length;

    let funded = 0;
    let bet    = 0;

    if (referred > 0 && showFunnel) {
      const refereeOids = refereeIds.map(toOid).filter(Boolean);

      const [fundedUsers, bettingParticipants, bettingCreators] = await Promise.all([
        db.collection('transactions').distinct('user', {
          ...DEPOSIT_FILTER,
          user: { $in: refereeOids },
        }),
        db.collection('game_bet').aggregate([
          { $match: { 'participants.user': { $in: refereeOids } } },
          { $unwind: '$participants' },
          { $match: { 'participants.user': { $in: refereeOids } } },
          { $group: { _id: '$participants.user' } },
        ]).toArray(),
        db.collection('game_bet').distinct('createdBy', { createdBy: { $in: refereeOids } }),
      ]);

      const fundedSet  = new Set(fundedUsers.map(String));
      const bettingSet = new Set([
        ...bettingParticipants.map((b) => String(b._id)),
        ...bettingCreators.map(String),
      ]);

      funded = refereeIds.filter((id) => fundedSet.has(id)).length;
      bet    = refereeIds.filter((id) => bettingSet.has(id)).length;
    }

    // Earnings are NOT returned here — they require password verification via POST /verify
    res.json({
      referralCode,
      username:     user.username,
      name:         user.name || null,
      referred,
      funded:       showFunnel ? funded : null,
      bet:          showFunnel ? bet    : null,
      showFunnel,
      showEarnings, // boolean only — actual figures require /verify
    });
  } catch (err) {
    console.error('[influencer-public] error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// POST /api/influencer-public/verify
// Verifies the influencer's platform password and returns earnings if correct.
router.post('/verify', async (req, res) => {
  try {
    const code     = (req.body.code     || '').trim().toUpperCase();
    const password = (req.body.password || '').trim();
    if (!code || !password)
      return res.status(400).json({ ok: false, error: 'Code and password required' });

    const db     = getDb();
    const sqlite = getSQLite();

    // Find user including password hash
    const user = await db.collection('users').findOne(
      { referralCode: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      { projection: { _id: 1, referralCode: 1, password: 1 } },
    );
    if (!user)
      return res.status(404).json({ ok: false, error: 'Referral code not found' });
    if (!user.password)
      return res.status(400).json({ ok: false, error: 'No password set for this account' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ ok: false, error: 'Incorrect password' });

    // Password correct — calculate earnings
    const referralCode = user.referralCode || code;
    const rateRow = sqlite.prepare('SELECT rate FROM influencer_rates WHERE referral_code = ?').get(referralCode.toUpperCase());
    const rate = rateRow ? rateRow.rate : 0;

    const referralDocs = await db.collection('referrals').find(
      { referrer: user._id },
      { projection: { referee: 1, referredUser: 1, newUser: 1 } },
    ).toArray();
    const refereeIds = referralDocs.map((d) =>
      String(d.referee || d.referredUser || d.newUser || '')
    ).filter(Boolean);

    const bet = await getBetCount(db, refereeIds);

    res.json({ ok: true, earnings: rate * bet, rate });
  } catch (err) {
    console.error('[influencer-public/verify] error:', err.message);
    res.status(500).json({ ok: false, error: 'Failed to verify' });
  }
});

module.exports = router;
