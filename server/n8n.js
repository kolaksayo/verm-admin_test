const crypto = require('crypto');
const { getDb: getSQLite } = require('./sqlite');

// Pushes contacts to an n8n webhook, which forwards them into Twenty CRM.
//
// The admin never talks to Twenty directly: n8n owns the CRM credentials and
// the field mapping, so changing the CRM side needs no deploy here. Batches are
// signed with an HMAC over the exact bytes sent, so the workflow can reject
// anything that did not come from this dashboard.

const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_BATCH_SIZE = 50;

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    const batch = Number(get('n8n_batch_size'));
    return {
      webhookUrl:  (get('n8n_webhook_url') || process.env.N8N_WEBHOOK_URL || '').trim(),
      secret:       get('n8n_secret')      || process.env.N8N_SECRET      || '',
      batchSize:    Number.isFinite(batch) && batch > 0 ? Math.min(batch, 200) : DEFAULT_BATCH_SIZE,
      autoPush:     get('n8n_auto_push') === '1',        // opt-in
      callingCode: (get('n8n_calling_code') || '234').replace(/\D/g, '') || '234',
      segmentConfig: safeJson(get('n8n_segment_config')),
    };
  } catch {
    return { webhookUrl: '', secret: '', batchSize: DEFAULT_BATCH_SIZE, autoPush: false, callingCode: '234', segmentConfig: {} };
  }
}

function safeJson(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function isConfigured(cfg = getConfig()) {
  return !!cfg.webhookUrl;
}

// Prefer the real name; `username` is a chosen handle and only stands in when
// the account has no name on it.
function contactName(user) {
  const hit = [user.name, user.fullName, user.displayName, user.username, user.email]
    .find((c) => typeof c === 'string' && c.trim());
  return hit ? hit.trim() : '';
}

// Twenty stores a person's name split in two, so split here rather than in the
// workflow: everything before the last space is the first name.
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/**
 * Splits an E.164 number into the calling code and the national number, which
 * is the shape Twenty's phones field wants. Only the configured code and a few
 * common ones are recognised; anything else keeps the full number and leaves
 * the calling code blank rather than guessing a wrong country.
 */
function splitPhone(e164, defaultCallingCode = '234') {
  const digits = String(e164 || '').replace(/\D/g, '');
  if (!digits) return { callingCode: '', number: '' };

  const fallback = String(defaultCallingCode).replace(/\D/g, '') || '234';
  // Local format ("08135835517") — drop the trunk 0 and apply the configured
  // calling code, matching normalizePhone() in whatsapp.js. Without this the
  // same person lands in the CRM twice, once local and once international.
  if (digits.startsWith('0')) {
    return { callingCode: `+${fallback}`, number: digits.slice(1) };
  }

  const codes = [...new Set([fallback, '1', '7', '20', '27', '33', '44', '234', '254', '255', '256', '233', '221', '212', '971'])]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);   // longest match wins
  for (const code of codes) {
    if (digits.startsWith(code) && digits.length > code.length) {
      return { callingCode: `+${code}`, number: digits.slice(code.length) };
    }
  }
  return { callingCode: '', number: digits };
}

/** The per-contact payload sent to n8n. Kept flat and CRM-agnostic. */
function toContactPayload(user, segments, cfg = getConfig()) {
  const full = contactName(user);
  const { firstName, lastName } = splitName(full);
  const rawPhone = user.mobile || user.phone || '';
  const { callingCode, number } = splitPhone(rawPhone, cfg.callingCode);

  return {
    userId:    String(user._id),
    name:      full,
    firstName,
    lastName,
    email:     user.email ? String(user.email).trim().toLowerCase() : '',
    phone:     number ? `${callingCode}${number}` : '',
    phoneNumber: number,
    phoneCallingCode: callingCode,
    username:  user.username ? String(user.username).trim() : '',
    createdAt: user.createdAt || null,
    segments,
    attributes: {
      role:              user.role || null,
      registrationStage: user.registrationStage || null,
      referralCode:      user.referralCode || null,
      gender:            user.gender || null,
    },
  };
}

// ── Delivery ────────────────────────────────────────────────────────────────

// Signature covers the exact serialized body, so the workflow can recompute it
// byte-for-byte. Re-serializing on the other side would not match.
function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Sends one batch. Returns {ok, status, error} — never throws, so one bad batch
 * cannot abort a long sync.
 */
async function postBatch(contacts, meta, cfg = getConfig()) {
  if (!isConfigured(cfg)) return { ok: false, status: 0, error: 'not_configured' };

  const body = JSON.stringify({
    source:  'vermo-admin',
    sentAt:  new Date().toISOString(),
    batch:   meta,
    contacts,
  });

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.secret) headers['x-vermo-signature'] = `sha256=${sign(body, cfg.secret)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: 'POST', headers, body, signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 300) || 'no body'}` };
    }
    return { ok: true, status: res.status, error: null, response: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── Local sync state ────────────────────────────────────────────────────────

// Hash of what was last sent, so a re-sync can skip contacts that have not
// changed instead of re-pushing the whole book through the CRM.
function contactHash(payload) {
  const stable = JSON.stringify({
    name: payload.name, email: payload.email, phone: payload.phone,
    username: payload.username, segments: payload.segments, attributes: payload.attributes,
  });
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 32);
}

function recordPush(userId, { name, email, phone, segments, hash, ok, error }) {
  try {
    getSQLite().prepare(`
      INSERT INTO n8n_contacts (user_id, name, email, phone, segments, hash, ok, error, pushed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        name = excluded.name, email = excluded.email, phone = excluded.phone,
        segments = excluded.segments, hash = excluded.hash, ok = excluded.ok,
        error = excluded.error, pushed_at = excluded.pushed_at
    `).run(
      String(userId), name || null, email || null, phone || null,
      (segments || []).join(','), hash || null, ok ? 1 : 0, error || null,
    );
  } catch { /* non-fatal */ }
}

function pushedHashes() {
  try {
    const rows = getSQLite().prepare('SELECT user_id, hash FROM n8n_contacts WHERE ok = 1').all();
    return new Map(rows.map((r) => [r.user_id, r.hash]));
  } catch {
    return new Map();
  }
}

function pushStats() {
  try {
    const row = getSQLite().prepare('SELECT COUNT(*) AS total, SUM(ok) AS pushed FROM n8n_contacts').get();
    const total = row?.total || 0;
    return { total, pushed: row?.pushed || 0, failed: total - (row?.pushed || 0) };
  } catch {
    return { total: 0, pushed: 0, failed: 0 };
  }
}

module.exports = {
  getConfig, isConfigured, toContactPayload, contactName, splitName, splitPhone,
  postBatch, sign, contactHash, recordPush, pushedHashes, pushStats,
  DEFAULT_BATCH_SIZE,
};
