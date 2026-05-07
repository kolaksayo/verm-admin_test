const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const KPI_COLLECTIONS = [
  { name: 'users', label: 'Total Users', icon: '👥' },
  { name: 'walletusers', label: 'Wallet Users', icon: '💳' },
  { name: 'transactions', label: 'Transactions', icon: '💰' },
  { name: 'game_bet', label: 'Game Bets', icon: '🎮' },
  { name: 'game_bet_leaderboard', label: 'Leaderboard Entries', icon: '🏆' },
  { name: 'referrals', label: 'Referrals', icon: '🔗' },
  { name: 'chatrooms', label: 'Chat Rooms', icon: '💬' },
  { name: 'follows', label: 'Follows', icon: '👣' },
  { name: 'football_fixtures', label: 'Football Fixtures', icon: '⚽' },
  { name: 'adminauditlogs', label: 'Audit Logs', icon: '📋' },
];

router.get('/stats', auth, async (req, res) => {
  try {
    const db = getDb();
    const stats = await Promise.all(
      KPI_COLLECTIONS.map(async ({ name, label, icon }) => {
        try {
          const count = await db.collection(name).countDocuments();
          return { name, label, icon, count };
        } catch {
          return { name, label, icon, count: 0 };
        }
      })
    );
    res.json(stats);
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
