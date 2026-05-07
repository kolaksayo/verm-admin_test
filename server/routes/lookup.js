const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// field: primary display name; image: URL field for logo/photo (optional)
const DISPLAY_FIELDS = {
  users: { fields: ['username', 'name', 'email'] },
  currencytypes: { fields: ['name', 'code', 'symbol'] },
  football_leagues: { fields: ['leagueName', 'name'], image: 'image' },
  football_fixtures: { fields: ['name', 'event'] },
  football_teams: { fields: ['name'], image: 'logo' },
  game_bet: { fields: ['bookingCode'] },
};

router.post('/:collection', auth, async (req, res) => {
  const { collection } = req.params;
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) return res.json({});

  const config = DISPLAY_FIELDS[collection];
  if (!config) return res.json({});

  const { fields, image } = config;

  try {
    const db = getDb();

    const objectIds = ids.map((id) => {
      try { return new ObjectId(id); } catch { return id; }
    });

    const projection = { _id: 1 };
    fields.forEach((f) => { projection[f] = 1; });
    if (image) projection[image] = 1;

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
      const imageUrl = image ? (doc[image] || null) : null;
      result[id] = imageUrl ? { name: displayName || id, image: imageUrl } : (displayName || id);
    });

    res.json(result);
  } catch (err) {
    console.error(`Lookup error [${collection}]:`, err);
    res.json({});
  }
});

module.exports = router;
