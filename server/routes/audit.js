const express = require('express');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
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

// GET /api/audit/finance-log
// Admin credit/debit history — structured finance audit log from admin_credits
router.get('/finance-log', auth, (req, res) => {
  try {
    const sqlite   = getSQLite();
    const limit    = Math.min(500, parseInt(req.query.limit) || 200);
    const filterAdmin  = req.query.admin    || null;
    const filterType   = req.query.txType   || null;

    const conditions = [];
    const params = [];
    if (filterAdmin) { conditions.push('admin_user = ?'); params.push(filterAdmin); }
    if (filterType)  { conditions.push('UPPER(COALESCE(tx_type,\'CREDIT\')) = ?'); params.push(filterType.toUpperCase()); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = sqlite.prepare(
      `SELECT * FROM admin_credits ${where} ORDER BY id DESC LIMIT ?`
    ).all(...params, limit).map((r) => ({
      id:            r.id,
      txType:        (r.tx_type || 'CREDIT').toUpperCase(),
      adminUser:     r.admin_user,
      userId:        r.user_id,
      walletId:      r.wallet_id,
      currencyName:  r.currency_name,
      amount:        r.amount,
      balanceBefore: r.balance_before,
      balanceAfter:  r.balance_after,
      description:   r.description,
      notes:         r.notes,
      createdAt:     r.created_at,
    }));

    const admins = sqlite.prepare('SELECT DISTINCT admin_user FROM admin_credits ORDER BY admin_user').all().map((r) => r.admin_user);

    res.json({ rows, admins });
  } catch (err) {
    console.error('[audit] finance-log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/activity-log
// Admin action log — document edits/deletes (excludes credit/debit wallet adjustments)
router.get('/activity-log', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const limit = Math.min(500, parseInt(req.query.limit) || 100);
    const filterUser       = req.query.user       || null;
    const filterCollection = req.query.collection || null;

    const conditions = ["action NOT IN ('credit','debit')"];
    const params = [];
    if (filterUser)       { conditions.push('admin_user = ?');  params.push(filterUser); }
    if (filterCollection) { conditions.push('collection = ?');  params.push(filterCollection); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const rawRows = sqlite.prepare(
      `SELECT * FROM admin_activity_logs ${where} ORDER BY id DESC LIMIT ?`
    ).all(...params, limit);

    const rows = rawRows.map((r) => ({
      _id:        r.id,
      adminUser:  r.admin_user,
      sessionId:  r.session_id,
      action:     r.action,
      collection: r.collection,
      documentId: r.document_id,
      before:     r.before_json ? JSON.parse(r.before_json) : null,
      after:      r.after_json  ? JSON.parse(r.after_json)  : null,
      timestamp:  r.created_at,
    }));

    const users       = sqlite.prepare("SELECT DISTINCT admin_user FROM admin_activity_logs WHERE action NOT IN ('credit','debit') ORDER BY admin_user").all().map((r) => r.admin_user);
    const collections = sqlite.prepare("SELECT DISTINCT collection FROM admin_activity_logs WHERE action NOT IN ('credit','debit') ORDER BY collection").all().map((r) => r.collection);

    res.json({ rows, users, collections });
  } catch (err) {
    console.error('[audit] activity-log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
