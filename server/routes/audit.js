const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/audit/orphaned-wallets
// Wallet records whose user/userId reference is null/missing or points to a
// non-existent user document.
router.get('/orphaned-wallets', auth, async (req, res) => {
  try {
    const db = getDb();

    const rows = await db.collection('walletusers').aggregate([
      // Normalise the user reference to a single string field
      {
        $addFields: {
          _ref: {
            $cond: {
              if:   { $gt: [{ $ifNull: ['$user', null] }, null] },
              then: { $toString: '$user' },
              else: {
                $cond: {
                  if:   { $gt: [{ $ifNull: ['$userId', null] }, null] },
                  then: { $toString: '$userId' },
                  else: null,
                },
              },
            },
          },
        },
      },
      // Look up the referenced user
      {
        $lookup: {
          from: 'users',
          let:  { ref: '$_ref' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: [{ $toString: '$_id' }, '$$ref'] },
              },
            },
          ],
          as: '_linked',
        },
      },
      // Keep only orphaned: null ref OR no matching user found
      {
        $match: {
          $or: [
            { _ref: null },
            { '_linked.0': { $exists: false } },
          ],
        },
      },
      // Clean up temp fields
      { $project: { _ref: 0, _linked: 0 } },
      { $sort: { updatedAt: -1, createdAt: -1 } },
      { $limit: 500 },
    ]).toArray();

    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error('[audit] orphaned-wallets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
