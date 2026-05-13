const express = require('express');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/ngn-deposits?page=&limit=&search=&dateFrom=&dateTo=
router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search   = (req.query.search   || '').trim();
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : null;
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const matchStage = { hook: 'safeHavenFunding' };

    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = dateFrom;
      if (dateTo)   matchStage.createdAt.$lte = dateTo;
    }

    if (search) {
      matchStage.$or = [
        { 'request.data.debitAccountName':   { $regex: search, $options: 'i' } },
        { 'request.data.debitAccountNumber':  { $regex: search, $options: 'i' } },
        { 'request.data.creditAccountNumber': { $regex: search, $options: 'i' } },
        { 'request.data.paymentReference':    { $regex: search, $options: 'i' } },
        { 'request.data.narration':           { $regex: search, $options: 'i' } },
      ];
    }

    const [total, docs] = await Promise.all([
      db.collection('hook_logs').countDocuments(matchStage),

      db.collection('hook_logs').aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },

        // Match hook_log → transaction via paymentReference or sessionId
        { $lookup: {
          from: 'transactions',
          let: {
            payRef: '$request.data.paymentReference',
            sessId: '$request.data.sessionId',
          },
          pipeline: [
            { $match: {
              $expr: {
                $or: [
                  { $eq: ['$reference',    '$$payRef'] },
                  { $eq: ['$reference',    '$$sessId'] },
                  { $eq: ['$txRef',        '$$payRef'] },
                  { $eq: ['$transactionRef','$$payRef'] },
                ],
              },
            }},
            { $limit: 1 },
            { $project: { user: 1, amount: 1, status: 1 } },
          ],
          as: 'tx',
        }},
        { $addFields: { tx: { $arrayElemAt: ['$tx', 0] } } },

        // Extract user ID from externalReference: "static_v_account_2_<userId>"
        // Split by "_" and take the last segment
        { $addFields: {
          _userId: { $arrayElemAt: [{ $split: ['$request.data.externalReference', '_'] }, -1] },
        }},

        // Lookup user directly by the extracted ID
        { $lookup: {
          from: 'users',
          let: { uid: { $ifNull: ['$_userId', ''] } },
          pipeline: [
            { $match: {
              $expr: {
                $and: [
                  { $ne: ['$$uid', ''] },
                  { $eq: [{ $toString: '$_id' }, '$$uid'] },
                ],
              },
            }},
            { $limit: 1 },
            { $project: { username: 1, displayName: 1, name: 1, email: 1 } },
          ],
          as: 'user',
        }},
        { $addFields: { user: { $arrayElemAt: ['$user', 0] } } },
      ]).toArray(),
    ]);

    res.json({
      docs: docs.map((d) => {
        const data = d.request?.data || {};
        const user = d.user;
        return {
          _id:                    d._id.toString(),
          username:               user
                                    ? (user.username || user.displayName || user.name || user.email || null)
                                    : null,
          depositorName:          data.debitAccountName         || null,
          depositorAccountNumber: data.debitAccountNumber       || null,
          platformAccountNumber:  data.creditAccountNumber      || null,
          platformAccountName:    data.creditAccountName        || null,
          amountNGN:              data.amount                   ?? null,
          fees:                   data.fees                     ?? null,
          vat:                    data.vat                      ?? null,
          stampDuty:              data.stampDuty                ?? null,
          narration:              data.narration                || null,
          paymentReference:       data.paymentReference         || null,
          sessionId:              data.sessionId                || null,
          status:                 data.status                   || null,
          createdAt:              d.createdAt,
          // From joined transaction
          walletCreditUSD: d.tx?.amount  ?? null,
          txStatus:        d.tx?.status  || null,
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
