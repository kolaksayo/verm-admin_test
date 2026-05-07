const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    let userId;
    try { userId = new ObjectId(req.params.id); } catch {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const [user, wallets, txAgg, betsCreatedAgg, leaderboardEntries] = await Promise.all([
      db.collection('users').findOne({ _id: userId }),
      db.collection('walletusers').find({ user: userId }).toArray(),
      db.collection('transactions').aggregate([
        { $match: { $or: [{ user: userId }, { userId: userId }] } },
        { $group: {
          _id: '$type',
          total: { $sum: 1 },
          amount: { $sum: '$amount' },
          last: { $max: '$createdAt' },
        }},
      ]).toArray(),
      db.collection('game_bet').aggregate([
        { $match: { createdBy: userId } },
        { $group: { _id: null, total: { $sum: 1 }, last: { $max: '$createdAt' } } },
      ]).toArray(),
      db.collection('game_bet_leaderboard').find({ user: userId }).toArray(),
    ]);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const currencyIds = wallets.map((w) => w.currencyType).filter(Boolean);
    const gameBetIds = leaderboardEntries.map((e) => e.gameBet).filter(Boolean);

    const toObjectId = (id) => { try { return new ObjectId(id.toString()); } catch { return id; } };

    const [currencies, gameBets] = await Promise.all([
      currencyIds.length
        ? db.collection('currencytypes').find({ _id: { $in: currencyIds.map(toObjectId) } }, { projection: { name: 1, symbol: 1, code: 1 } }).toArray()
        : [],
      gameBetIds.length
        ? db.collection('game_bet').find({ _id: { $in: gameBetIds.map(toObjectId) } }, { projection: { bookingCode: 1 } }).toArray()
        : [],
    ]);

    const currencyMap = {};
    currencies.forEach((c) => { currencyMap[c._id.toString()] = { name: c.name, symbol: c.symbol, code: c.code }; });
    const gameBetMap = {};
    gameBets.forEach((g) => { gameBetMap[g._id.toString()] = g.bookingCode || g._id.toString(); });

    res.json({
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        phone: user.phone,
        createdAt: user.createdAt,
        isVerified: user.isVerified,
        isActive: user.isActive ?? true,
      },
      wallets: wallets.map((w) => ({
        currency: w.currencyType ? (currencyMap[w.currencyType.toString()] || { name: String(w.currencyType) }) : { name: 'Unknown' },
        balance: w.balance || 0,
        updatedAt: w.updatedAt,
      })),
      transactions: txAgg,
      betsCreated: betsCreatedAgg[0] || { total: 0, last: null },
      leaderboard: leaderboardEntries.map((e) => ({
        competition: e.gameBet ? (gameBetMap[e.gameBet.toString()] || String(e.gameBet)) : 'Unknown',
        rank: e.rank ?? e.position ?? null,
        points: e.points ?? e.score ?? e.totalPoints ?? null,
        correct: e.correctPredictions ?? null,
        total: e.totalPredictions ?? null,
      })),
    });
  } catch (err) {
    console.error('User profile error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
