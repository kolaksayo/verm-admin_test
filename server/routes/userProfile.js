const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');

const router = express.Router();

function userQuery(userId, userIdStr) {
  return { $or: [{ user: userId }, { user: userIdStr }, { userId: userId }, { userId: userIdStr }] };
}

router.get('/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    let userId;
    try { userId = new ObjectId(req.params.id); } catch {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const userIdStr = req.params.id;

    const user = await db.collection('users').findOne({ _id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Leaderboard: try all common field name patterns and both ObjectId/string
    const leaderboardEntries = await db.collection('game_bet_leaderboard').find({
      $or: [
        { user: userId }, { user: userIdStr },
        { userId: userId }, { userId: userIdStr },
        { player: userId }, { player: userIdStr },
        { participant: userId }, { participant: userIdStr },
      ],
    }).toArray();

    // Also find game_bets this user participated in (via participants array or createdBy)
    const participatedBets = await db.collection('game_bet').find({
      $or: [
        { createdBy: userId }, { createdBy: userIdStr },
        { participants: userId }, { participants: userIdStr },
        { 'participants.user': userId }, { 'participants.user': userIdStr },
        { 'players.user': userId }, { 'players.user': userIdStr },
      ],
    }, { projection: { bookingCode: 1, title: 1, name: 1, createdAt: 1 } }).toArray();

    const [wallets, txAgg, betsCreatedAgg] = await Promise.all([
      db.collection('walletusers').find(userQuery(userId, userIdStr)).toArray(),

      db.collection('transactions').aggregate([
        { $match: userQuery(userId, userIdStr) },
        { $group: {
          _id: '$type',
          total: { $sum: 1 },
          amount: { $sum: '$amount' },
          last: { $max: '$createdAt' },
          first: { $min: '$createdAt' },
        }},
      ]).toArray(),

      db.collection('game_bet').aggregate([
        { $match: { $or: [{ createdBy: userId }, { createdBy: userIdStr }] } },
        { $group: { _id: null, total: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]).toArray(),
    ]);

    const toObjectId = (id) => { try { return new ObjectId(id.toString()); } catch { return null; } };

    const currencyIds = wallets.map((w) => w.currencyType).filter(Boolean);
    const leaderboardBetIds = leaderboardEntries.map((e) => e.gameBet).filter(Boolean);

    const [currencies, leaderboardBets] = await Promise.all([
      currencyIds.length
        ? db.collection('currencytypes').find({
            _id: { $in: currencyIds.map(toObjectId).filter(Boolean) },
          }, { projection: { name: 1, symbol: 1, code: 1 } }).toArray()
        : [],
      leaderboardBetIds.length
        ? db.collection('game_bet').find({
            _id: { $in: leaderboardBetIds.map(toObjectId).filter(Boolean) },
          }, { projection: { bookingCode: 1, title: 1, name: 1, createdAt: 1 } }).toArray()
        : [],
    ]);

    const currencyMap = {};
    currencies.forEach((c) => { currencyMap[c._id.toString()] = { name: c.name, symbol: c.symbol, code: c.code }; });

    const gameBetMap = {};
    leaderboardBets.forEach((g) => {
      gameBetMap[g._id.toString()] = { label: g.bookingCode || g.title || g.name || g._id.toString(), createdAt: g.createdAt };
    });

    // Merge leaderboard entries and direct participation
    const leaderboardCompetitions = leaderboardEntries.map((e) => {
      const betKey = e.gameBet ? String(e.gameBet) : null;
      const bet = betKey ? gameBetMap[betKey] : null;
      return {
        source: 'leaderboard',
        competition: bet?.label || betKey || 'Unknown',
        competitionDate: bet?.createdAt || null,
        rank: e.rank ?? e.position ?? null,
        points: e.points ?? e.score ?? e.totalPoints ?? null,
        correct: e.correctPredictions ?? null,
        total: e.totalPredictions ?? null,
      };
    });

    const directCompetitions = participatedBets
      .filter((g) => !leaderboardBetIds.some((id) => String(id) === String(g._id)))
      .map((g) => ({
        source: 'direct',
        competition: g.bookingCode || g.title || g.name || g._id.toString(),
        competitionDate: g.createdAt || null,
        rank: null,
        points: null,
        correct: null,
        total: null,
      }));

    // Merge SQLite admin adjustments into the MongoDB transaction aggregation
    try {
      const acRows = getSQLite().prepare(
        `SELECT tx_type, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
           FROM admin_credits WHERE user_id = ?
           GROUP BY tx_type`
      ).all(String(userId));
      for (const row of acRows) {
        const txType = (row.tx_type || 'CREDIT').toUpperCase();
        const entry = txAgg.find((t) => (t._id || '').toString().toUpperCase() === txType);
        if (entry) {
          entry.total  += row.cnt;
          entry.amount += row.total;
        } else {
          txAgg.push({ _id: txType, total: row.cnt, amount: row.total, last: null, first: null });
        }
      }
    } catch { /* non-fatal */ }

    res.json({
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        phone: user.mobile || user.phone,
        createdAt: user.createdAt,
        isVerified: user.isVerified,
        isActive: user.isActive ?? true,
      },
      wallets: wallets.map((w) => ({
        id: w._id.toString(),
        currency: w.currencyType
          ? (currencyMap[w.currencyType.toString()] || { name: String(w.currencyType) })
          : { name: 'Unknown' },
        balance: w.walletBalance ?? w.balance ?? 0,
        updatedAt: w.updatedAt,
      })),
      transactions: txAgg,
      betsCreated: betsCreatedAgg[0] || { total: 0, last: null },
      leaderboard: [...leaderboardCompetitions, ...directCompetitions],
    });
  } catch (err) {
    console.error('User profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Distinct transaction descriptions for a user (for sub-filter chips)
router.get('/:id/transaction-descriptions', auth, async (req, res) => {
  try {
    const db = getDb();
    let userId;
    try { userId = new ObjectId(req.params.id); } catch {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const userIdStr = req.params.id;
    const type = req.query.type;

    const matchBase = userQuery(userId, userIdStr);
    const match = type
      ? { $and: [matchBase, { type: { $regex: new RegExp(`^${type}$`, 'i') } }] }
      : matchBase;

    const descriptions = await db.collection('transactions').distinct('description', match);
    res.json(descriptions.filter(Boolean).sort());
  } catch (err) {
    console.error('Transaction descriptions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Paginated individual transactions for a user
router.get('/:id/transactions', auth, async (req, res) => {
  try {
    const db = getDb();
    let userId;
    try { userId = new ObjectId(req.params.id); } catch {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const userIdStr = req.params.id;
    const type = req.query.type; // 'credit' | 'debit' | undefined
    const description = req.query.description; // exact description filter
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const matchBase = userQuery(userId, userIdStr);
    const conditions = [matchBase];
    if (type) conditions.push({ type: { $regex: new RegExp(`^${type}$`, 'i') } });
    if (description) conditions.push({ description: { $regex: new RegExp(`^${description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    const match = conditions.length > 1 ? { $and: conditions } : matchBase;

    const total = await db.collection('transactions').countDocuments(match);
    const docs = await db.collection('transactions')
      .find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Resolve currency names
    const currencyIds = [...new Set(docs.map((d) => d.currencyType).filter(Boolean).map(String))];
    const currencies = currencyIds.length
      ? await db.collection('currencytypes').find({
          _id: { $in: currencyIds.map((id) => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) },
        }, { projection: { name: 1, symbol: 1 } }).toArray()
      : [];
    const currencyMap = {};
    currencies.forEach((c) => { currencyMap[c._id.toString()] = { name: c.name, symbol: c.symbol }; });

    res.json({
      docs: docs.map((d) => ({
        _id: d._id.toString(),
        type: d.type,
        amount: d.amount,
        description: d.description || d.narration || d.reference || d.note || null,
        reference: d.reference || d.txRef || d.transactionRef || null,
        currency: d.currencyType ? (currencyMap[String(d.currencyType)] || null) : null,
        status: d.status || null,
        createdAt: d.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('User transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
