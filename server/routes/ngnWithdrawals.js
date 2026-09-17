const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const escapeRegex = require('../utils/escapeRegex');

const router = express.Router();

const WITHDRAWAL_FILTER = {
  type:        { $regex: /^DEBIT$/i },
  description: { $regex: /safehaven naira transfer/i },
};

const toOid = (id) => { try { return new ObjectId(id.toString()); } catch { return null; } };

// GET /api/ngn-withdrawals?page=&limit=&search=&dateFrom=&dateTo=&status=
router.get('/', auth, requirePermission('users_finance', 'transactions'), async (req, res) => {
  try {
    const db = getDb();
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom + 'T00:00:00.000Z') : null;
    const dateTo   = req.query.dateTo   ? new Date(req.query.dateTo   + 'T23:59:59.999Z') : null;

    const matchStage = { ...WITHDRAWAL_FILTER };

    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = dateFrom;
      if (dateTo)   matchStage.createdAt.$lte = dateTo;
    }
    if (status) {
      const ALLOWED_STATUSES = ['pending', 'success', 'failed', 'processing', 'reversed'];
      if (ALLOWED_STATUSES.includes(status.toLowerCase())) {
        matchStage.status = { $regex: new RegExp(`^${status}$`, 'i') };
      }
    }
    if (search) {
      const safe = escapeRegex(search);
      matchStage.$or = [
        { 'gateWayResponse.data.creditAccountName':   { $regex: safe, $options: 'i' } },
        { 'gateWayResponse.data.creditAccountNumber': { $regex: safe, $options: 'i' } },
        { 'gateWayResponse.data.debitAccountNumber':  { $regex: safe, $options: 'i' } },
        { paymentRef: { $regex: safe, $options: 'i' } },
        { reference:  { $regex: safe, $options: 'i' } },
      ];
    }

    const [total, docs] = await Promise.all([
      db.collection('transactions').countDocuments(matchStage),

      db.collection('transactions').aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        // Join user → users collection
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

    // Distinct statuses for filter dropdown
    const statuses = await db.collection('transactions').distinct('status', WITHDRAWAL_FILTER);

    res.json({
      docs: docs.map((d) => {
        const gw   = d.gateWayResponse?.data || {};
        const user = d.userDoc;
        return {
          _id:                      d._id.toString(),
          username:                 user
                                      ? (user.username || user.displayName || user.name || user.email || null)
                                      : null,
          // Recipient (user's bank details)
          recipientName:            gw.creditAccountName    || null,
          recipientAccountNumber:   gw.creditAccountNumber  || null,
          // Platform outbound account
          platformAccountName:      gw.debitAccountName     || null,
          platformAccountNumber:    gw.debitAccountNumber   || null,
          // Amounts
          amountNGN:                gw.amount               ?? null,
          amountUSD:                d.amount                ?? null,
          balanceBefore:            d.balanceBefore         ?? null,
          balanceAfter:             d.balanceAfter          ?? null,
          // Fees
          fees:                     gw.fees                 ?? null,
          vat:                      gw.vat                  ?? null,
          stampDuty:                gw.stampDuty            ?? null,
          // Meta
          status:                   d.status                || null,
          paymentRef:               d.paymentRef || d.paymentReference || null,
          narration:                gw.narration            || null,
          sessionId:                gw.sessionId            || null,
          createdAt:                d.createdAt,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      statuses: statuses.filter(Boolean).sort(),
    });
  } catch (err) {
    console.error('NGN withdrawals error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
