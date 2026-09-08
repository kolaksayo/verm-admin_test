const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const escapeRegex = require('../utils/escapeRegex');

const router = express.Router();

const DEPOSIT_FILTER = {
  type:        { $regex: /^CREDIT$/i },
  description: { $regex: /^TOP\s*UP$/i },
  'gateWayResponse.data.amount': { $exists: true, $gt: 0 },
};

// GET /api/ngn-deposits?page=&limit=&search=&dateFrom=&dateTo=
router.get('/', auth, requirePermission('users_finance', 'transactions'), async (req, res) => {
  try {
    const db = getDb();
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : null;
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const matchStage = { ...DEPOSIT_FILTER };

    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = dateFrom;
      if (dateTo)   matchStage.createdAt.$lte = dateTo;
    }

    if (search) {
      const safe = escapeRegex(search);
      matchStage.$or = [
        { 'gateWayResponse.data.debitAccountName':   { $regex: safe, $options: 'i' } },
        { 'gateWayResponse.data.debitAccountNumber':  { $regex: safe, $options: 'i' } },
        { 'gateWayResponse.data.creditAccountNumber': { $regex: safe, $options: 'i' } },
        { 'gateWayResponse.data.paymentReference':    { $regex: safe, $options: 'i' } },
        { 'gateWayResponse.data.narration':           { $regex: safe, $options: 'i' } },
      ];
    }

    const [total, docs] = await Promise.all([
      db.collection('transactions').countDocuments(matchStage),

      db.collection('transactions').aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },

        // Join transaction.user → users (user ID is directly on the transaction)
        { $lookup: {
          from: 'users',
          let: { uid: { $ifNull: [{ $toString: '$user' }, ''] } },
          pipeline: [
            { $match: { $expr: { $and: [
              { $ne: ['$$uid', ''] },
              { $eq: [{ $toString: '$_id' }, '$$uid'] },
            ]}}},
            { $limit: 1 },
            { $project: { username: 1, displayName: 1, name: 1, email: 1 } },
          ],
          as: 'userDoc',
        }},
        { $addFields: { userDoc: { $arrayElemAt: ['$userDoc', 0] } } },
      ]).toArray(),
    ]);

    res.json({
      docs: docs.map((d) => {
        const gw   = d.gateWayResponse?.data || {};
        const user = d.userDoc;
        return {
          _id:                    d._id.toString(),
          username:               user
                                    ? (user.username || user.displayName || user.name || user.email || null)
                                    : null,
          depositorName:          gw.debitAccountName    || null,
          depositorAccountNumber: gw.debitAccountNumber  || null,
          platformAccountNumber:  gw.creditAccountNumber || null,
          platformAccountName:    gw.creditAccountName   || null,
          amountNGN:              gw.amount              ?? null,
          walletCreditUSD:        d.amount               ?? null,
          fees:                   gw.fees                ?? null,
          vat:                    gw.vat                 ?? null,
          stampDuty:              gw.stampDuty           ?? null,
          narration:              gw.narration           || null,
          paymentReference:       gw.paymentReference    || null,
          sessionId:              gw.sessionId           || null,
          status:                 d.status               || null,
          createdAt:              d.createdAt,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('NGN deposits error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
