const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const { normalizePhone } = require('../whatsapp');
const {
  getConfig, isConfigured, pushContact, testConnection, recordSync, syncStats,
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

// POST /api/chatwoot/sync — start a background bulk sync
// body: { resync?: boolean }  resync=true re-pushes contacts already synced.
router.post('/sync', auth, requirePermission('system', 'notifications'), async (req, res) => {
  if (job && job.running) return res.status(409).json({ ok: false, error: 'A sync is already running' });
  const cfg = getConfig();
  if (!isConfigured(cfg)) return res.status(400).json({ ok: false, error: 'Chatwoot not configured' });

  const resync = !!req.body?.resync;

  let cursorFilter = CONTACT_FILTER;
  if (!resync) {
    // Skip users already synced successfully.
    const done = getSQLite().prepare('SELECT user_id FROM chatwoot_contacts WHERE ok = 1').all()
      .map((r) => r.user_id)
      .filter((id) => /^[0-9a-f]{24}$/i.test(id))
      .map((id) => new ObjectId(id));
    if (done.length) cursorFilter = { $and: [CONTACT_FILTER, { _id: { $nin: done } }] };
  }

  const db = getDb();
  const total = await db.collection('users').countDocuments(cursorFilter);

  job = {
    running: true, total, processed: 0, created: 0, updated: 0, failed: 0, skipped: 0,
    startedAt: new Date().toISOString(), finishedAt: null, error: null, cancel: false, resync,
  };
  res.json({ ok: true, started: true, total });

  // Run detached — the client polls /sync/status.
  (async () => {
    try {
      const cursor = db.collection('users')
        .find(cursorFilter, { projection: { username: 1, displayName: 1, name: 1, email: 1, mobile: 1, phone: 1 } });

      for await (const user of cursor) {
        if (job.cancel) break;
        const phoneDigits = normalizePhone(user.mobile || user.phone || '');
        const result = await pushContact(user, phoneDigits, cfg);

        recordSync(user._id, {
          contactId: result.contactId,
          phone: phoneDigits || null,
          email: user.email || null,
          name: user.username || user.displayName || user.name || null,
          ok: result.ok,
          error: result.error,
        });

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
