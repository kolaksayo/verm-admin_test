const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Priority display fields for each collection
const DISPLAY_FIELDS = {
  users: ['username', 'name', 'email'],
  currencytypes: ['name', 'code', 'symbol'],
  football_leagues: ['name'],
  football_fixtures: ['name', 'event'],
  football_teams: ['name'],
  game_bet: ['bookingCode'],
};

router.post('/:collection', auth, async (req, res) => {
  const { collection } = req.params;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) return res.json({});

  const fields = DISPLAY_FIELDS[collection];
  if (!fields) return res.json({});

  try {
    const db = getDb();

    const objectIds = ids.map((id) => {
      try { return new ObjectId(id); } catch { return id; }
    });

    const projection = { _id: 1 };
    fields.forEach((f) => { projection[f] = 1; });

    const docs = await db
      .collection(collection)
      .find({ _id: { $in: objectIds } }, { projection })
      .toArray();

    const result = {};
    docs.forEach((doc) => {
      const id = doc._id.toString();
      let displayName = null;
      for (const field of fields) {
        if (doc[field]) { displayName = doc[field]; break; }
      }
      result[id] = displayName || id;
    });

    res.json(result);
  } catch (err) {
    console.error(`Lookup error [${collection}]:`, err);
    res.json({});
  }
});

module.exports = router;
