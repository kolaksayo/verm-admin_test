const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const { normalizePhone } = require('../whatsapp');
const {
  getConfig, isConfigured, pushContact, testConnection, recordSync, syncStats, contactName,
  markContactDeleted, unmarkContactDeleted, markDeletedLocally, liveSyncedRows,
} = require('../chatwoot');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

// Contacts are users reachable on at least one channel.
const CONTACT_FILTER = {
  $or: [
    { mobile: { $exists: true, $nin: [null, ''] } },
    { email:  { $exists: true, $nin: [null, ''] } },
  ],
};

const SYNC_THROTTLE_MS = 250;   // stay well inside Chatwoot's rate limits
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// In-memory job state. A single sync at a time; progress is polled by the UI.
let job = null;   // { running, total, processed, created, updated, failed, skipped, startedAt, finishedAt, error, cancel }

function jobView() {
  if (!job) return { running: false, idle: true };
  const { cancel, ...rest } = job;
  return { idle: false, ...rest };
}

// GET /api/chatwoot/config
router.get('/config', auth, requirePermission('system', 'notifications'), (req, res) => {
  const cfg = getConfig();
  res.json({
    baseUrl:      cfg.baseUrl   || '',
    accountId:    cfg.accountId || '',
    inboxId:      cfg.inboxId   || '',
    apiTokenSet:  !!cfg.apiToken,
    apiToken:     cfg.apiToken ? cfg.apiToken.slice(0, 6) + '…' : '',
    autoSync:     cfg.autoSync,
    configured:   isConfigured(cfg),
    stats:        syncStats(),
  });
});

// POST /api/chatwoot/config
router.post('/config', auth, requirePermission('system', 'notifications'), (req, res) => {
  const { baseUrl, accountId, apiToken, inboxId, autoSync } = req.body;

  const hasBase   = baseUrl   != null;
  const hasAcct   = accountId != null;
  const hasToken  = apiToken  != null && String(apiToken).trim() !== '';   // blank keeps current
  const hasInbox  = inboxId   != null;
  const hasAuto   = autoSync  != null;

  if (!hasBase && !hasAcct && !hasToken && !hasInbox && !hasAuto) {
    return res.status(400).json({ ok: false, error: 'Provide at least one field to update' });
  }
  if (hasBase && String(baseUrl).trim() && !/^https?:\/\//i.test(String(baseUrl).trim())) {
    return res.status(400).json({ ok: false, error: 'Base URL must start with http:// or https://' });
  }
  if (hasToken && !/^[\x00-\x7F]+$/.test(String(apiToken))) {
    return res.status(400).json({ ok: false, error: 'API token contains invalid characters — paste the full token, not the masked preview.' });
  }

  try {
    const upsert = getSQLite().prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    if (hasBase)  upsert.run('chatwoot_base_url',   String(baseUrl).trim().replace(/\/+$/, ''));
    if (hasAcct)  upsert.run('chatwoot_account_id', String(accountId).trim());
    if (hasToken) upsert.run('chatwoot_api_token',  String(apiToken).trim());
    if (hasInbox) upsert.run('chatwoot_inbox_id',   String(inboxId).trim());
    if (hasAuto)  upsert.run('chatwoot_auto_sync',  autoSync ? '1' : '0');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/chatwoot/test — verify credentials without writing anything
router.post('/test', auth, requirePermission('system', 'notifications'), async (req, res) => {
  res.json(await testConnection());
});

// GET /api/chatwoot/eligible-count — how many contacts a full sync would cover
router.get('/eligible-count', auth, requirePermission('system', 'notifications'), async (req, res) => {
  try {
    const count = await getDb().collection('users').countDocuments(CONTACT_FILTER);
    res.json({ count, stats: syncStats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chatwoot/sync/status
router.get('/sync/status', auth, requirePermission('system', 'notifications'), (req, res) => {
  res.json(jobView());
});

// POST /api/chatwoot/sync/cancel
router.post('/sync/cancel', auth, requirePermission('system', 'notifications'), (req, res) => {
  if (!job || !job.running) return res.status(400).json({ ok: false, error: 'No sync in progress' });
  job.cancel = true;
  res.json({ ok: true });
});

// Reads user_ids out of chatwoot_contacts as ObjectIds. `extra` narrows further.
function recordedIds(whereOk, extra = '') {
  return getSQLite().prepare(`SELECT user_id FROM chatwoot_contacts WHERE ok = ${whereOk} ${extra}`).all()
    .map((r) => r.user_id)
    .filter((id) => /^[0-9a-f]{24}$/i.test(id))
    .map((id) => new ObjectId(id));
}

// POST /api/chatwoot/sync — start a background bulk sync
// body: { mode?: 'new' | 'all' | 'failed' }   ({ resync: true } is the old spelling of 'all')
//   new    — everything not yet synced successfully
//   all    — re-push every contact, refreshing names/numbers already in Chatwoot
//   failed — retry only the contacts whose last push failed
router.post('/sync', auth, requirePermission('system', 'notifications'), async (req, res) => {
  if (job && job.running) return res.status(409).json({ ok: false, error: 'A sync is already running' });
  const cfg = getConfig();
  if (!isConfigured(cfg)) return res.status(400).json({ ok: false, error: 'Chatwoot not configured' });

  const mode = req.body?.mode || (req.body?.resync ? 'all' : 'new');
  if (!['new', 'all', 'failed'].includes(mode)) {
    return res.status(400).json({ ok: false, error: `Unknown sync mode "${mode}"` });
  }

  let cursorFilter = CONTACT_FILTER;
  if (mode === 'new') {
    // Skip users already synced successfully.
    const done = recordedIds(1, 'AND deleted_at IS NULL');
    if (done.length) cursorFilter = { $and: [CONTACT_FILTER, { _id: { $nin: done } }] };
  } else if (mode === 'failed') {
    const failed = recordedIds(0);
    if (!failed.length) return res.status(400).json({ ok: false, error: 'No failed contacts to retry' });
    cursorFilter = { _id: { $in: failed } };
  }

  const flagged = new Set(
    getSQLite().prepare('SELECT user_id FROM chatwoot_contacts WHERE deleted_at IS NOT NULL').all()
      .map((r) => r.user_id),
  );

  const db = getDb();
  const total = await db.collection('users').countDocuments(cursorFilter);

  job = {
    running: true, total, processed: 0, created: 0, updated: 0, failed: 0, skipped: 0,
    startedAt: new Date().toISOString(), finishedAt: null, error: null, cancel: false, mode,
  };
  res.json({ ok: true, started: true, total, mode });

  // Run detached — the client polls /sync/status.
  (async () => {
    try {
      const cursor = db.collection('users')
        .find(cursorFilter, { projection: { username: 1, displayName: 1, name: 1, fullName: 1, email: 1, mobile: 1, phone: 1 } });

      for await (const user of cursor) {
        if (job.cancel) break;
        const phoneDigits = normalizePhone(user.mobile || user.phone || '');
        const result = await pushContact(user, phoneDigits, cfg);

        recordSync(user._id, {
          contactId: result.contactId,
          phone: phoneDigits || null,
          email: user.email || null,
          name: contactName(user),
          ok: result.ok,
          error: result.error,
        });

        // The user exists again, so lift the deleted label we put on them.
        if (result.ok && flagged.has(String(user._id))) {
          await unmarkContactDeleted(result.contactId, cfg);
        }

        job.processed += 1;
        if (result.ok && result.action === 'created')      job.created += 1;
        else if (result.ok && result.action === 'updated') job.updated += 1;
        else if (result.action === 'skipped')              job.skipped += 1;
        else                                               job.failed  += 1;

        await delay(SYNC_THROTTLE_MS);
      }
    } catch (err) {
      job.error = err.message;
      console.error('[Chatwoot] sync failed:', err.message);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      console.log(`[Chatwoot] sync finished — created ${job.created}, updated ${job.updated}, failed ${job.failed}, skipped ${job.skipped}`);
    }
  })();
});

// Marking every contact deleted because of a bad query would be very hard to
// undo, so a batch this large needs explicit confirmation.
const RECONCILE_ALARM_RATIO = 0.25;
const RECONCILE_ALARM_MIN   = 10;

// Which synced contacts no longer have a user in Mongo.
async function findVanished() {
  const rows = liveSyncedRows().filter((r) => /^[0-9a-f]{24}$/i.test(r.user_id));
  if (!rows.length) return { rows: [], vanished: [] };

  const alive = new Set();
  const ids = rows.map((r) => new ObjectId(r.user_id));
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    const found = await getDb().collection('users')
      .find({ _id: { $in: batch } }, { projection: { _id: 1 } }).toArray();
    found.forEach((u) => alive.add(String(u._id)));
  }
  return { rows, vanished: rows.filter((r) => !alive.has(r.user_id)) };
}

// GET /api/chatwoot/reconcile/preview — who would be marked, changing nothing
router.get('/reconcile/preview', auth, requirePermission('system', 'notifications'), async (req, res) => {
  try {
    const { rows, vanished } = await findVanished();
    const ratio = rows.length ? vanished.length / rows.length : 0;
    res.json({
      checked: rows.length,
      vanished: vanished.length,
      needsConfirmation: vanished.length >= RECONCILE_ALARM_MIN && ratio > RECONCILE_ALARM_RATIO,
      sample: vanished.slice(0, 50).map((r) => ({ user_id: r.user_id, name: r.name })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chatwoot/reconcile — mark vanished users' contacts as deleted
// body: { confirm?: boolean } — required when the batch trips the alarm above.
router.post('/reconcile', auth, requirePermission('system', 'notifications'), async (req, res) => {
  if (job && job.running) return res.status(409).json({ ok: false, error: 'A sync is already running' });
  const cfg = getConfig();
  if (!isConfigured(cfg)) return res.status(400).json({ ok: false, error: 'Chatwoot not configured' });

  let rows, vanished;
  try {
    ({ rows, vanished } = await findVanished());
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Could not read users: ${err.message}` });
  }

  if (!vanished.length) return res.json({ ok: true, started: false, vanished: 0 });

  const ratio = rows.length ? vanished.length / rows.length : 0;
  if (vanished.length >= RECONCILE_ALARM_MIN && ratio > RECONCILE_ALARM_RATIO && !req.body?.confirm) {
    return res.status(409).json({
      ok: false, needsConfirmation: true, vanished: vanished.length, checked: rows.length,
      error: `${vanished.length} of ${rows.length} synced contacts appear deleted. Confirm to proceed.`,
    });
  }

  const when = new Date().toISOString();
  job = {
    running: true, total: vanished.length, processed: 0, created: 0, updated: 0, failed: 0, skipped: 0,
    startedAt: when, finishedAt: null, error: null, cancel: false, mode: 'reconcile',
  };
  res.json({ ok: true, started: true, total: vanished.length, mode: 'reconcile' });

  (async () => {
    try {
      for (const row of vanished) {
        if (job.cancel) break;
        const result = await markContactDeleted(row.contact_id, cfg, when);
        if (result.ok) { markDeletedLocally(row.user_id, when); job.updated += 1; }
        else job.failed += 1;
        job.processed += 1;
        await delay(SYNC_THROTTLE_MS);
      }
    } catch (err) {
      job.error = err.message;
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      console.log(`[Chatwoot] reconcile finished — marked ${job.updated}, failed ${job.failed}`);
    }
  })();
});

// GET /api/chatwoot/deleted — contacts already flagged as deleted
router.get('/deleted', auth, requirePermission('system', 'notifications'), (req, res) => {
  try {
    const rows = getSQLite().prepare(
      'SELECT user_id, contact_id, name, phone, email, deleted_at FROM chatwoot_contacts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500',
    ).all();
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/chatwoot/logs — recent per-contact sync results
router.get('/logs', auth, requirePermission('system', 'notifications'), (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const onlyFailed = req.query.failed === '1';
    const rows = getSQLite().prepare(
      `SELECT * FROM chatwoot_contacts ${onlyFailed ? 'WHERE ok = 0' : ''} ORDER BY synced_at DESC LIMIT ?`,
    ).all(limit);
    res.json({ rows, stats: syncStats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
