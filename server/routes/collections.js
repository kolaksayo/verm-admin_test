const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb, getWriteDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');
const { requireEditMode } = require('../middleware/auth');

const router = express.Router();

// These collections are never writable — financial records and audit history must be immutable
const READONLY_COLLECTIONS = new Set([
  'adminauditlogs', 'transactions', 'game_bet', 'game_bet_leaderboard',
  'hook_logs', 'referrals', 'telegram_notified',
]);

const ALLOWED_COLLECTIONS = [
  'adminauditlogs', 'chatrooms', 'comments', 'contracts', 'currencytypes',
  'dollar_naira_rate', 'follows', 'football_bet_template',
  'football_fixture_head_to_head', 'football_fixture_stats', 'football_fixtures',
  'football_leagues', 'football_seasons', 'football_team_players', 'football_teams',
  'game_bet', 'game_bet_leaderboard', 'hook_logs', 'likedsports', 'likes',
  'referrals', 'transactions', 'userchatsubscriptions', 'users', 'walletusers',
];

router.get('/', auth, (req, res) => {
  res.json(ALLOWED_COLLECTIONS);
});

// Enriched walletusers handler — joins email and mobile from the users collection
async function fetchWalletUsers(db, { page, limit, search, sortField, sortOrder }) {
  const safeSearch = search ? search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

  // Normalise the user reference to a comparable string
  const addRef = {
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
  };

  const lookupUser = {
    $lookup: {
      from: 'users',
      let:  { ref: '$_ref' },
      pipeline: [
        { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$ref'] } } },
        { $project: { email: 1, mobile: 1 } },
      ],
      as: '_user',
    },
  };

  const addUserFields = {
    $addFields: {
      userEmail:  { $ifNull: [{ $arrayElemAt: ['$_user.email',  0] }, null] },
      userMobile: { $ifNull: [{ $arrayElemAt: ['$_user.mobile', 0] }, null] },
    },
  };

  const cleanUp = { $project: { _ref: 0, _user: 0 } };

  // Build optional search match
  let matchStage = null;
  if (safeSearch) {
    const regex = { $regex: safeSearch, $options: 'i' };
    const conditions = [{ userEmail: regex }, { userMobile: regex }];
    // Also match by ObjectId if the term looks like one
    if (search.length === 24) {
      try { conditions.push({ _id: new ObjectId(search) }); } catch {}
    }
    matchStage = { $match: { $or: conditions } };
  }

  const base = [addRef, lookupUser, addUserFields, cleanUp, ...(matchStage ? [matchStage] : [])];

  const [countResult, docs] = await Promise.all([
    db.collection('walletusers').aggregate([...base, { $count: 'n' }]).toArray(),
    db.collection('walletusers').aggregate([
      ...base,
      { $sort: { [sortField]: sortOrder } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]).toArray(),
  ]);

  return { docs, total: countResult[0]?.n || 0, page, limit, totalPages: Math.ceil((countResult[0]?.n || 0) / limit) };
}

// Transactions handler — explicit description/type/status search + SQLite admin credits
async function fetchTransactions(db, { page, limit, search, sortField, sortOrder }) {
  const safeSearch = search ? search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

  // Build MongoDB query
  let mongoQuery = {};
  if (search) {
    if (search.length === 24) {
      try { mongoQuery = { _id: new ObjectId(search) }; } catch {}
    }
    if (!mongoQuery._id) {
      mongoQuery = {
        $or: [
          { description: { $regex: safeSearch, $options: 'i' } },
          { type:        { $regex: safeSearch, $options: 'i' } },
          { status:      { $regex: safeSearch, $options: 'i' } },
        ],
      };
    }
  }

  // Fetch matching admin credits from SQLite
  // Include them when: no search, or search matches "admin", "top up", "credit"
  const lc = search.toLowerCase();
  const adminCreditDocs = (() => {
    try {
      const matchesAdminCredit = !search ||
        'admin top up'.includes(lc) ||
        lc.includes('admin') ||
        lc.includes('top up');
      if (!matchesAdminCredit) return [];
      return getSQLite().prepare(
        `SELECT * FROM admin_credits ORDER BY created_at DESC LIMIT 500`
      ).all().map((r) => ({
        _id:         `admin-credit-${r.id}`,
        type:        'CREDIT',
        description: 'Admin TOP UP',
        amount:      r.amount,
        status:      'COMPLETED',
        createdAt:   r.created_at,
        adminUser:   r.admin_user,
        notes:       r.notes || undefined,
      }));
    } catch { return []; }
  })();

  const [mongoTotal, mongoDocs] = await Promise.all([
    db.collection('transactions').countDocuments(mongoQuery),
    db.collection('transactions')
      .find(mongoQuery)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(page === 1 ? limit - Math.min(adminCreditDocs.length, limit) : limit)
      .toArray(),
  ]);

  // Page 1: prepend admin credits (sorted by date with mongo docs), cap at limit
  let docs;
  if (page === 1 && adminCreditDocs.length > 0) {
    const merged = [...adminCreditDocs, ...mongoDocs];
    if (sortField === 'createdAt') {
      merged.sort((a, b) => {
        const av = new Date(a.createdAt).getTime();
        const bv = new Date(b.createdAt).getTime();
        return sortOrder === 1 ? av - bv : bv - av;
      });
    }
    docs = merged.slice(0, limit);
  } else {
    docs = mongoDocs;
  }

  const total = mongoTotal + adminCreditDocs.length;
  return { docs, total, page, limit, totalPages: Math.ceil(total / limit) };
}

router.get('/:name', auth, async (req, res) => {
  const { name } = req.params;
  if (!ALLOWED_COLLECTIONS.includes(name)) {
    return res.status(403).json({ error: 'Collection not allowed' });
  }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const search = req.query.search ? req.query.search.trim() : '';
  const sortField = req.query.sort || '_id';
  const sortOrder = req.query.order === 'asc' ? 1 : -1;

  try {
    const db = getDb();

    // walletusers gets a special enriched path that joins user email + mobile
    if (name === 'walletusers') {
      const result = await fetchWalletUsers(db, { page, limit, search, sortField, sortOrder });
      return res.json(result);
    }

    // transactions gets explicit description/type/status search + SQLite admin credits merged in
    if (name === 'transactions') {
      const result = await fetchTransactions(db, { page, limit, search, sortField, sortOrder });
      return res.json(result);
    }

    const collection = db.collection(name);

    let query = {};

    if (search) {
      let isObjectId = false;
      if (search.length === 24) {
        try {
          new ObjectId(search);
          isObjectId = true;
        } catch {}
      }

      if (isObjectId) {
        query = { _id: new ObjectId(search) };
      } else {
        const sample = await collection.findOne();
        if (sample) {
          const stringFields = Object.entries(sample)
            .filter(([k, v]) => typeof v === 'string' && k !== '_id')
            .map(([k]) => k);

          if (stringFields.length > 0) {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query = {
              $or: stringFields.map((field) => ({
                [field]: { $regex: safeSearch, $options: 'i' },
              })),
            };
          }
        }
      }
    }

    const total = await collection.countDocuments(query);
    const docs = await collection
      .find(query)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({
      docs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(`Collection fetch error [${name}]:`, err);
    res.status(500).json({ error: 'Failed to fetch collection data' });
  }
});

router.get('/:name/:id', auth, async (req, res) => {
  const { name, id } = req.params;
  if (!ALLOWED_COLLECTIONS.includes(name)) {
    return res.status(403).json({ error: 'Collection not allowed' });
  }

  try {
    const db = getDb();
    let doc;

    try {
      doc = await db.collection(name).findOne({ _id: new ObjectId(id) });
    } catch {
      doc = await db.collection(name).findOne({ _id: id });
    }

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(doc);
  } catch (err) {
    console.error(`Document fetch error [${name}/${id}]:`, err);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

function writeAuditLog(_, { adminUser, sessionId, action, collection, documentId, before, after }) {
  try {
    getSQLite().prepare(`
      INSERT INTO admin_activity_logs
        (admin_user, session_id, action, collection, document_id, before_json, after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminUser,
      sessionId || null,
      action,
      collection,
      String(documentId),
      before ? JSON.stringify(before) : null,
      after  ? JSON.stringify(after)  : null,
    );
  } catch { /* non-fatal */ }
}

// PATCH /api/collections/:name/:id — update a document (edit mode required)
router.patch('/:name/:id', auth, requireEditMode, async (req, res) => {
  const { name, id } = req.params;
  if (!ALLOWED_COLLECTIONS.includes(name)) {
    return res.status(403).json({ error: 'Collection not allowed' });
  }
  if (READONLY_COLLECTIONS.has(name)) {
    return res.status(403).json({ error: `${name} is read-only and cannot be modified` });
  }

  const updates = req.body;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  try {
    const rDb = getDb();
    const wDb = getWriteDb();
    let oid;
    try { oid = new ObjectId(id); } catch { oid = id; }

    const before = await rDb.collection(name).findOne({ _id: oid });
    if (!before) return res.status(404).json({ error: 'Document not found' });

    // Strip _id to prevent mutation; merge updates onto existing doc
    const { _id: _stripped, ...safeUpdates } = updates;
    const after = { ...before, ...safeUpdates, _id: before._id };

    await wDb.collection(name).replaceOne({ _id: oid }, after);

    await writeAuditLog(null, {
      adminUser:  req.user.username,
      sessionId:  req.editSessionId,
      action:     'update',
      collection: name,
      documentId: id,
      before,
      after,
    });

    const refreshed = await rDb.collection(name).findOne({ _id: oid });
    res.json({ ok: true, doc: refreshed });
  } catch (err) {
    console.error(`Collection update error [${name}/${id}]:`, err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// DELETE /api/collections/:name/:id — delete a document (edit mode required)
router.delete('/:name/:id', auth, requireEditMode, async (req, res) => {
  const { name, id } = req.params;
  if (!ALLOWED_COLLECTIONS.includes(name)) {
    return res.status(403).json({ error: 'Collection not allowed' });
  }
  if (READONLY_COLLECTIONS.has(name)) {
    return res.status(403).json({ error: `${name} is read-only and cannot be modified` });
  }

  try {
    const rDb = getDb();
    const wDb = getWriteDb();
    let oid;
    try { oid = new ObjectId(id); } catch { oid = id; }

    const before = await rDb.collection(name).findOne({ _id: oid });
    if (!before) return res.status(404).json({ error: 'Document not found' });

    await wDb.collection(name).deleteOne({ _id: oid });

    await writeAuditLog(null, {
      adminUser:  req.user.username,
      sessionId:  req.editSessionId,
      action:     'delete',
      collection: name,
      documentId: id,
      before,
      after:      null,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(`Collection delete error [${name}/${id}]:`, err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
