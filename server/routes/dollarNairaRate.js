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
router.get('/current', auth, async (req, res) => {
  try {
    const db     = getDb();
    const sqlite = getSQLite();
    const period = getNigeriaPeriod();
    const today  = todayNigeria();

    // Live rate from the single platform document (dollar_naira_rate, singular)
    const doc      = await db.collection('dollar_naira_rate').findOne({});
    const liveRate = doc?.rate ? Number(doc.rate) : null;

    // Today's snapshots from SQLite for the three period cards
    const rows = sqlite.prepare(
      'SELECT period, rate FROM ngn_rate_snapshots WHERE date = ?'
    ).all(today);
    const todayRates = { morning: null, midday: null, night: null };
    rows.forEach((r) => { todayRates[r.period] = r.rate; });

    res.json({ period, date: today, rate: liveRate, today: todayRates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dollar-naira-rate?page=&limit= — SQLite snapshot history grouped by date
router.get('/', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const total = sqlite.prepare(
      'SELECT COUNT(DISTINCT date) AS n FROM ngn_rate_snapshots'
    ).get().n;

    const docs = sqlite.prepare(`
      SELECT date,
        MAX(CASE WHEN period = 'morning' THEN rate END) AS morning,
        MAX(CASE WHEN period = 'midday'  THEN rate END) AS midday,
        MAX(CASE WHEN period = 'night'   THEN rate END) AS night
      FROM ngn_rate_snapshots
      GROUP BY date
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({ docs, total, page, limit, totalPages: Math.ceil(total / limit) });
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
router.get('/sqlite/current', auth, (req, res) => {
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
