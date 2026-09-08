const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const {
  getConfig, isConfigured, toContactPayload, postBatch,
  contactHash, recordPush, pushedHashes, pushStats,
} = require('../n8n');
const {
  computeSegments, buildBetStats, allSegmentSlugs, describeSegments, mergeConfig,
} = require('../segments');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

// A contact needs somewhere for the CRM to reach it.
const CONTACT_FILTER = {
  $or: [
    { mobile: { $exists: true, $nin: [null, ''] } },
    { email:  { $exists: true, $nin: [null, ''] } },
  ],
};

const USER_PROJECTION = {
  name: 1, fullName: 1, displayName: 1, username: 1, email: 1, mobile: 1, phone: 1,
  createdAt: 1, role: 1, registrationStage: 1, emailVerified: 1, referralCode: 1,
  gender: 1, nairaAccount: 1, coinAddress: 1,
};

const BATCH_PAUSE_MS = 200;   // gap between batches so n8n is not flooded
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// One sync at a time; the UI polls for progress.
let job = null;

function jobView() {
  if (!job) return { idle: true, running: false };
  const { cancel, ...rest } = job;
  return { idle: false, ...rest };
}

function upsertSetting(key, value) {
  getSQLite().prepare(`
    INSERT INTO admin_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value);
}

// ── Config ──────────────────────────────────────────────────────────────────

router.get('/config', auth, requirePermission('system', 'crm_sync'), (req, res) => {
  const cfg = getConfig();
  res.json({
    webhookUrl:   cfg.webhookUrl,
    secretSet:    !!cfg.secret,
    batchSize:    cfg.batchSize,
    autoPush:     cfg.autoPush,
    callingCode:  cfg.callingCode,
    segmentConfig: mergeConfig(cfg.segmentConfig),
    configured:   isConfigured(cfg),
    stats:        pushStats(),
  });
});

router.post('/config', auth, requirePermission('system', 'crm_sync'), (req, res) => {
  const { webhookUrl, secret, batchSize, autoPush, callingCode, segmentConfig } = req.body || {};

  const has = (v) => v != null;
  const hasSecret = has(secret) && String(secret).trim() !== '';   // blank keeps the stored one
  if (!has(webhookUrl) && !hasSecret && !has(batchSize) && !has(autoPush)
      && !has(callingCode) && !has(segmentConfig)) {
    return res.status(400).json({ ok: false, error: 'Provide at least one field to update' });
  }

  if (has(webhookUrl) && String(webhookUrl).trim()) {
    const url = String(webhookUrl).trim();
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, error: 'Webhook URL must start with http:// or https://' });
    }
  }
  if (has(batchSize)) {
    const n = Number(batchSize);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      return res.status(400).json({ ok: false, error: 'Batch size must be a whole number between 1 and 200' });
    }
  }

  try {
    if (has(webhookUrl))   upsertSetting('n8n_webhook_url', String(webhookUrl).trim());
    if (hasSecret)         upsertSetting('n8n_secret', String(secret).trim());
    if (has(batchSize))    upsertSetting('n8n_batch_size', String(Number(batchSize)));
    if (has(autoPush))     upsertSetting('n8n_auto_push', autoPush ? '1' : '0');
    if (has(callingCode))  upsertSetting('n8n_calling_code', String(callingCode).replace(/\D/g, '') || '234');
    if (has(segmentConfig)) upsertSetting('n8n_segment_config', JSON.stringify(mergeConfig(segmentConfig)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Segments ────────────────────────────────────────────────────────────────

// GET /api/n8n/segments — definitions plus how many contacts fall in each.
// `?counts=0` skips the scan when only the definitions are needed.
router.get('/segments', auth, requirePermission('system', 'crm_sync'), async (req, res) => {
  const cfg = getConfig();
  const defs = describeSegments(cfg.segmentConfig);
  if (req.query.counts === '0') return res.json({ segments: defs, counts: null, total: 0 });

  try {
    const db = getDb();
    const users = await db.collection('users').find(CONTACT_FILTER, { projection: USER_PROJECTION }).toArray();
    const stats = await buildBetStats(db, users.map((u) => u._id));

    const counts = Object.fromEntries(defs.map((d) => [d.slug, 0]));
    let unsegmented = 0;
    for (const u of users) {
      const segs = computeSegments(u, stats.get(String(u._id)), cfg.segmentConfig);
      if (!segs.length) unsegmented += 1;
      segs.forEach((s) => { counts[s] += 1; });
    }
    res.json({ segments: defs, counts, total: users.length, unsegmented });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The workflow answers 200 even when Twenty rejected every contact, so a
// delivered batch is not the same as a synced one. Read the body it returns.
function readWorkflowResult(result) {
  if (!result.ok) return { ok: false, error: result.error };
  let parsed;
  try {
    parsed = JSON.parse(result.response || '{}');
  } catch {
    return { ok: true, error: null, detail: null };   // non-JSON body, nothing to check
  }
  const failed = Number(parsed.failed) || 0;
  const upserted = Number(parsed.upserted) || 0;
  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];

  if (parsed.ok === false || failed > 0) {
    return {
      ok: false,
      error: `Twenty rejected ${failed || 'the'} contact(s)` + (errors.length ? ` — ${errors[0]}` : ''),
      detail: parsed,
    };
  }
  // Delivered, accepted, but nothing written — usually every contact was skipped.
  if (upserted === 0 && parsed.note) {
    return { ok: false, error: parsed.note, detail: parsed };
  }
  return { ok: true, error: null, detail: parsed };
}

// ── Test ────────────────────────────────────────────────────────────────────

// POST /api/n8n/test — sends a single clearly-marked sample contact so the
// workflow can be verified without touching real records.
router.post('/test', auth, requirePermission('system', 'crm_sync'), async (req, res) => {
  const cfg = getConfig();
  if (!isConfigured(cfg)) return res.status(400).json({ ok: false, error: 'Save an n8n webhook URL first' });

  const sample = {
    userId: 'test-contact', name: 'Vermo Test Contact',
    firstName: 'Vermo', lastName: 'Test Contact',
    email: 'test-contact@vermo.invalid',    // .invalid never resolves
    phone: '+2348000000000', phoneNumber: '8000000000', phoneCallingCode: '+234',
    username: 'vermo_test', createdAt: new Date().toISOString(),
    segments: ['test'],
    attributes: { role: 'USER', registrationStage: 'COMPLETED', referralCode: null, gender: null },
  };

  const result = await postBatch([sample], { index: 0, size: 1, total: 1, test: true }, cfg);
  const verdict = readWorkflowResult(result);
  res.json(verdict.ok
    ? { ok: true, response: result.response, detail: verdict.detail }
    : { ok: false, error: verdict.error, detail: verdict.detail });
});

// ── Sync ────────────────────────────────────────────────────────────────────

router.get('/sync/status', auth, requirePermission('system', 'crm_sync'), (req, res) => res.json(jobView()));

router.post('/sync/cancel', auth, requirePermission('system', 'crm_sync'), (req, res) => {
  if (!job || !job.running) return res.status(400).json({ ok: false, error: 'No sync in progress' });
  job.cancel = true;
  res.json({ ok: true });
});

/**
 * POST /api/n8n/sync
 * body: { mode?: 'changed'|'all'|'failed', segments?: string[] }
 *   changed — contacts never pushed, or whose details/segments changed (default)
 *   all     — every contact, regardless of what was pushed before
 *   failed  — retry only contacts whose last push failed
 * `segments` restricts the push to contacts in at least one of those segments.
 */
router.post('/sync', auth, requirePermission('system', 'crm_sync'), async (req, res) => {
  if (job && job.running) return res.status(409).json({ ok: false, error: 'A sync is already running' });

  const cfg = getConfig();
  if (!isConfigured(cfg)) return res.status(400).json({ ok: false, error: 'n8n webhook URL not configured' });

  const mode = req.body?.mode || 'changed';
  if (!['changed', 'all', 'failed'].includes(mode)) {
    return res.status(400).json({ ok: false, error: `Unknown sync mode "${mode}"` });
  }

  const wanted = Array.isArray(req.body?.segments) ? req.body.segments.filter(Boolean) : [];
  const known = new Set(allSegmentSlugs());
  const unknown = wanted.filter((s) => !known.has(s));
  if (unknown.length) {
    return res.status(400).json({ ok: false, error: `Unknown segment(s): ${unknown.join(', ')}` });
  }

  let filter = CONTACT_FILTER;
  if (mode === 'failed') {
    const failed = getSQLite().prepare('SELECT user_id FROM n8n_contacts WHERE ok = 0').all()
      .map((r) => r.user_id).filter((id) => /^[0-9a-f]{24}$/i.test(id)).map((id) => new ObjectId(id));
    if (!failed.length) return res.status(400).json({ ok: false, error: 'No failed contacts to retry' });
    filter = { _id: { $in: failed } };
  }

  const db = getDb();
  let users;
  try {
    users = await db.collection('users').find(filter, { projection: USER_PROJECTION }).toArray();
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Could not read users: ${err.message}` });
  }

  const stats = await buildBetStats(db, users.map((u) => u._id));
  const already = mode === 'all' ? new Map() : pushedHashes();

  // Build the outgoing list up front so `total` is honest and the segment
  // filter is applied before anything is sent.
  const queue = [];
  for (const u of users) {
    const segments = computeSegments(u, stats.get(String(u._id)), cfg.segmentConfig);
    if (wanted.length && !segments.some((s) => wanted.includes(s))) continue;

    const payload = toContactPayload(u, segments, cfg);
    if (!payload.email && !payload.phone) continue;   // nothing for the CRM to key on

    const hash = contactHash(payload);
    if (mode === 'changed' && already.get(String(u._id)) === hash) continue;
    queue.push({ payload, hash });
  }

  if (!queue.length) {
    return res.json({ ok: true, started: false, total: 0, reason: 'Nothing to push — everything is up to date.' });
  }

  job = {
    running: true, mode, segments: wanted, total: queue.length,
    processed: 0, pushed: 0, failed: 0, batches: 0, batchesFailed: 0,
    startedAt: new Date().toISOString(), finishedAt: null, error: null, cancel: false,
  };
  res.json({ ok: true, started: true, total: queue.length, mode });

  // Detached — the client polls /sync/status.
  (async () => {
    try {
      const size = cfg.batchSize;
      const totalBatches = Math.ceil(queue.length / size);
      for (let i = 0; i < queue.length; i += size) {
        if (job.cancel) break;
        const slice = queue.slice(i, i + size);
        const result = await postBatch(
          slice.map((s) => s.payload),
          { index: job.batches, size: slice.length, total: totalBatches },
          cfg,
        );

        // A 200 from n8n only means the batch arrived; the body says whether
        // Twenty actually accepted it.
        const verdict = readWorkflowResult(result);

        for (const { payload, hash } of slice) {
          recordPush(payload.userId, {
            name: payload.name, email: payload.email, phone: payload.phone,
            segments: payload.segments, hash,
            ok: verdict.ok, error: verdict.ok ? null : verdict.error,
          });
        }

        job.batches += 1;
        job.processed += slice.length;
        if (verdict.ok) job.pushed += slice.length;
        else { job.failed += slice.length; job.batchesFailed += 1; job.lastError = verdict.error; }

        await delay(BATCH_PAUSE_MS);
      }
    } catch (err) {
      job.error = err.message;
      console.error('[n8n] sync failed:', err.message);
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
      console.log(`[n8n] sync finished — pushed ${job.pushed}, failed ${job.failed}, batches ${job.batches}`);
    }
  })();
});

// ── Logs ────────────────────────────────────────────────────────────────────

router.get('/logs', auth, requirePermission('system', 'crm_sync'), (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const onlyFailed = req.query.failed === '1';
    const rows = getSQLite().prepare(
      `SELECT user_id, name, email, phone, segments, ok, error, pushed_at
         FROM n8n_contacts ${onlyFailed ? 'WHERE ok = 0' : ''}
        ORDER BY pushed_at DESC LIMIT ?`,
    ).all(limit);
    res.json({ rows, stats: pushStats() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
