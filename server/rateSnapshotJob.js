const { getDb: getMongo } = require('./db');
const { getDb: getSQLite } = require('./sqlite');

// Nigeria = UTC+1
function nigeriaHour() {
  return (new Date().getUTCHours() + 1) % 24;
}

function todayNigeria() {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
}

function currentPeriod() {
  const h = nigeriaHour();
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'midday';
  if (h >= 18)            return 'night';
  return null; // 00:00–05:59 — wait for morning
}

async function snapshot(period, source = 'scheduled') {
  const date   = todayNigeria();
  const sqlite = getSQLite();
  const mongo  = getMongo();

  // Fetch from MongoDB admin rate entry
  const doc  = await mongo.collection('dollar_naira_rates').findOne({ date });
  const rate = doc?.[period];

  if (!rate || rate <= 0) {
    console.log(`[RateSnapshot] No ${period} rate for ${date} in MongoDB — skipping`);
    return null;
  }

  // Upsert into SQLite (INSERT OR REPLACE respects the UNIQUE constraint)
  sqlite.prepare(`
    INSERT INTO ngn_rate_snapshots (date, period, rate, source, captured_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(date, period) DO UPDATE SET rate = excluded.rate,
      source = excluded.source, captured_at = excluded.captured_at
  `).run(date, period, rate, source);

  console.log(`[RateSnapshot] ${source} — saved ${period} rate for ${date}: ₦${rate}`);
  return rate;
}

// Check once per minute; snapshot each period the first time it's seen today
function startSnapshotScheduler() {
  const captured = new Set(); // "date:period" keys already saved this run

  const tick = async () => {
    const period = currentPeriod();
    if (!period) return;

    const key = `${todayNigeria()}:${period}`;
    if (captured.has(key)) return;

    // Also skip if SQLite already has this period (e.g. after server restart)
    const sqlite   = getSQLite();
    const existing = sqlite.prepare(
      'SELECT id FROM ngn_rate_snapshots WHERE date = ? AND period = ?'
    ).get(todayNigeria(), period);

    if (existing) { captured.add(key); return; }

    const rate = await snapshot(period, 'scheduled');
    if (rate) captured.add(key);
  };

  // Run immediately on startup, then every 60 s
  tick().catch(console.error);
  setInterval(() => tick().catch(console.error), 60_000);
  console.log('[RateSnapshot] Scheduler started — checks every 60s');
}

module.exports = { startSnapshotScheduler, snapshot };
