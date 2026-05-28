const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb, getWriteDb } = require('../db');
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

async function writeAuditLog(db, { adminUser, sessionId, action, collection, documentId, before, after }) {
  try {
    await db.collection('adminauditlogs').insertOne({
      adminUser,
      sessionId,
      action,
      collection,
      documentId: String(documentId),
      before: before || null,
      after:  after  || null,
      timestamp: new Date(),
    });
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

    await writeAuditLog(wDb, {
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

    await writeAuditLog(wDb, {
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
