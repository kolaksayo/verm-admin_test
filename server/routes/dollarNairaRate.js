const express = require('express');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const { snapshot } = require('../rateSnapshotJob');
const auth = require('../middleware/auth');

const router = express.Router();

// Nigeria is UTC+1
function getNigeriaPeriod() {
  const hour = (new Date().getUTCHours() + 1) % 24;
  if (hour >= 6  && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'midday';
  return 'night';
}

function todayNigeria() {
  const now = new Date(Date.now() + 60 * 60 * 1000); // shift to UTC+1
  return now.toISOString().slice(0, 10);
}

// GET /api/dollar-naira-rate/current
router.get('/current', async (req, res) => {
  try {
    const db     = getDb();
    const period = getNigeriaPeriod();
    const today  = todayNigeria();

    // Try today, fall back to the most recent day that has the needed field
    let doc = await db.collection('dollar_naira_rates').findOne(
      { date: today, [period]: { $exists: true, $gt: 0 } },
    );
    if (!doc) {
      doc = await db.collection('dollar_naira_rates').findOne(
        { [period]: { $exists: true, $gt: 0 } },
        { sort: { date: -1 } },
      );
    }

    res.json({
      period,
      date:  doc?.date  || today,
      rate:  doc?.[period] || null,
      today: { morning: doc?.morning || null, midday: doc?.midday || null, night: doc?.night || null },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dollar-naira-rate?page=&limit=
router.get('/', auth, async (req, res) => {
  try {
    const db    = getDb();
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));

    const [total, docs] = await Promise.all([
      db.collection('dollar_naira_rates').countDocuments(),
      db.collection('dollar_naira_rates')
        .find()
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    res.json({ docs, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dollar-naira-rate  — upsert by date
router.post('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const { date, morning, midday, night } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }
    const update = { updatedAt: new Date() };
    if (morning != null && morning > 0) update.morning = Number(morning);
    if (midday  != null && midday  > 0) update.midday  = Number(midday);
    if (night   != null && night   > 0) update.night   = Number(night);

    if (!Object.keys(update).some((k) => k !== 'updatedAt')) {
      return res.status(400).json({ error: 'At least one rate (morning/midday/night) is required' });
    }

    await db.collection('dollar_naira_rates').updateOne(
      { date },
      {
        $set: update,
        $setOnInsert: { date, createdAt: new Date() },
      },
      { upsert: true },
    );

    const saved = await db.collection('dollar_naira_rates').findOne({ date });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/dollar-naira-rate/:date
router.delete('/:date', auth, async (req, res) => {
  try {
    const db = getDb();
    await db.collection('dollar_naira_rates').deleteOne({ date: req.params.date });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SQLite snapshot endpoints ─────────────────────────────────────────────────

// GET /api/dollar-naira-rate/sqlite — paginated SQLite snapshot history
router.get('/sqlite', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const total = sqlite.prepare('SELECT COUNT(*) AS n FROM ngn_rate_snapshots').get().n;
    const rows  = sqlite.prepare(
      'SELECT * FROM ngn_rate_snapshots ORDER BY date DESC, period ASC LIMIT ? OFFSET ?'
    ).all(limit, offset);

    res.json({ rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dollar-naira-rate/sqlite/current — best rate from SQLite for right now
router.get('/sqlite/current', (req, res) => {
  try {
    const sqlite = getSQLite();
    const today  = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
    const h      = (new Date().getUTCHours() + 1) % 24;
    const period = h >= 6 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'midday' : 'night';

    // Try today's period, then fall back to most recent available
    const row = sqlite.prepare(
      "SELECT * FROM ngn_rate_snapshots WHERE date = ? AND period = ?"
    ).get(today, period)
      || sqlite.prepare(
      "SELECT * FROM ngn_rate_snapshots ORDER BY date DESC, captured_at DESC LIMIT 1"
    ).get();

    res.json({ period, today, row: row || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dollar-naira-rate/sqlite/snapshot — manually trigger a snapshot now
router.post('/sqlite/snapshot', auth, async (req, res) => {
  try {
    const h      = (new Date().getUTCHours() + 1) % 24;
    const period = req.body.period
      || (h >= 6 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'midday' : 'night');

    if (!['morning','midday','night'].includes(period)) {
      return res.status(400).json({ error: 'period must be morning, midday, or night' });
    }

    const rate = await snapshot(period, 'manual');
    if (rate == null) {
      return res.status(404).json({ ok: false, error: `No ${period} rate found in MongoDB for today` });
    }
    res.json({ ok: true, period, rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
