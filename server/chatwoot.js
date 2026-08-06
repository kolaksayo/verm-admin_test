const { getDb: getSQLite } = require('./sqlite');

// Chatwoot contact sync.
//
// Contacts are pushed with `identifier` set to the Mongo user _id, which is
// Chatwoot's own uniqueness key — so re-running a sync updates the existing
// contact instead of creating duplicates. Local sync state lives in the
// chatwoot_contacts table, which also makes a large sync resumable.

const FETCH_TIMEOUT_MS = 15000;

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      baseUrl:   (get('chatwoot_base_url')  || process.env.CHATWOOT_BASE_URL  || '').replace(/\/+$/, ''),
      accountId:  get('chatwoot_account_id') || process.env.CHATWOOT_ACCOUNT_ID || '',
      apiToken:   get('chatwoot_api_token')  || process.env.CHATWOOT_API_TOKEN  || '',
      inboxId:    get('chatwoot_inbox_id')   || '',
      autoSync:   get('chatwoot_auto_sync') !== '0',   // default on
    };
  } catch {
    return { baseUrl: '', accountId: '', apiToken: '', inboxId: '', autoSync: true };
  }
}

function isConfigured(cfg = getConfig()) {
  return !!(cfg.baseUrl && cfg.accountId && cfg.apiToken);
}

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function apiUrl(cfg, path) {
  return `${cfg.baseUrl}/api/v1/accounts/${cfg.accountId}${path}`;
}

function headers(cfg) {
  return { 'api_access_token': cfg.apiToken, 'Content-Type': 'application/json' };
}

// Chatwoot wants E.164. normalizePhone() in whatsapp.js yields bare digits with
// the country code already applied, so this only adds the '+'.
function toE164(digits) {
  const d = String(digits || '').replace(/\D/g, '');
  return d ? `+${d}` : null;
}

// Build the Chatwoot contact payload from a Mongo user document.
function toContactPayload(user, phoneDigits) {
  const name = user.username || user.displayName || user.name || user.email || 'Unknown';
  const payload = {
    identifier: String(user._id),
    name,
    custom_attributes: { source: 'vermo-admin' },
  };
  const phone = toE164(phoneDigits);
  if (phone) payload.phone_number = phone;
  if (user.email) payload.email = String(user.email).trim().toLowerCase();
  return payload;
}

// Find an existing contact by our identifier. Used to recover the contact id
// when a create returns 422 because the contact already exists.
async function findByIdentifier(cfg, identifier) {
  try {
    const res = await fetchWithTimeout(
      apiUrl(cfg, `/contacts/search?q=${encodeURIComponent(identifier)}`),
      { method: 'GET', headers: headers(cfg) },
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const list = json.payload || json.data?.payload || [];
    const hit = list.find((c) => String(c.identifier) === String(identifier));
    return hit?.id ?? null;
  } catch {
    return null;
  }
}

async function updateContact(cfg, contactId, payload) {
  const res = await fetchWithTimeout(apiUrl(cfg, `/contacts/${contactId}`), {
    method: 'PUT', headers: headers(cfg), body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/**
 * Create or update one contact. Idempotent: safe to call repeatedly.
 * @returns {Promise<{ok: boolean, contactId: number|null, action: string, error: string|null}>}
 */
async function pushContact(user, phoneDigits, cfg = getConfig()) {
  if (!isConfigured(cfg)) return { ok: false, contactId: null, action: 'skipped', error: 'not_configured' };

  const payload = toContactPayload(user, phoneDigits);
  if (!payload.phone_number && !payload.email) {
    return { ok: false, contactId: null, action: 'skipped', error: 'no_phone_or_email' };
  }
  if (cfg.inboxId) payload.inbox_id = Number(cfg.inboxId);

  try {
    const res = await fetchWithTimeout(apiUrl(cfg, '/contacts'), {
      method: 'POST', headers: headers(cfg), body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      const contactId = json.payload?.contact?.id ?? json.payload?.id ?? json.id ?? null;
      return { ok: true, contactId, action: 'created', error: null };
    }

    // 422 = a contact with this identifier/phone/email already exists. Find it
    // and update, so the sync converges instead of failing.
    if (res.status === 422) {
      const existingId = json.payload?.contact?.id
        ?? json.attributes?.id
        ?? await findByIdentifier(cfg, payload.identifier);
      if (existingId) {
        const upd = await updateContact(cfg, existingId, payload);
        return upd.ok
          ? { ok: true, contactId: existingId, action: 'updated', error: null }
          : { ok: false, contactId: existingId, action: 'update_failed', error: extractError(upd.json) };
      }
      return { ok: false, contactId: null, action: 'duplicate', error: extractError(json) };
    }

    return { ok: false, contactId: null, action: 'failed', error: `HTTP ${res.status}: ${extractError(json)}` };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    return { ok: false, contactId: null, action: 'failed', error: reason };
  }
}

function extractError(json) {
  if (!json || typeof json !== 'object') return 'api_error';
  const cands = [
    json.message,
    typeof json.error === 'string' ? json.error : null,
    Array.isArray(json.errors) ? json.errors.join('; ') : json.errors?.message,
    json.attributes ? JSON.stringify(json.attributes).slice(0, 120) : null,
  ];
  const msg = cands.find((c) => typeof c === 'string' && c.trim());
  return msg ? String(msg).slice(0, 300) : 'api_error';
}

// ── Local sync state ─────────────────────────────────────────────────────────

function recordSync(userId, { contactId, phone, email, name, ok, error }) {
  try {
    getSQLite().prepare(`
      INSERT INTO chatwoot_contacts (user_id, contact_id, phone, email, name, ok, error, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        contact_id = excluded.contact_id, phone = excluded.phone, email = excluded.email,
        name = excluded.name, ok = excluded.ok, error = excluded.error, synced_at = excluded.synced_at
    `).run(String(userId), contactId ?? null, phone ?? null, email ?? null, name ?? null, ok ? 1 : 0, error ?? null);
  } catch { /* non-fatal */ }
}

function syncedUserIds() {
  try {
    return getSQLite().prepare('SELECT user_id FROM chatwoot_contacts WHERE ok = 1').all().map((r) => r.user_id);
  } catch {
    return [];
  }
}

function syncStats() {
  try {
    const row = getSQLite().prepare(
      'SELECT COUNT(*) AS total, SUM(ok) AS synced FROM chatwoot_contacts',
    ).get();
    return { total: row?.total || 0, synced: row?.synced || 0, failed: (row?.total || 0) - (row?.synced || 0) };
  } catch {
    return { total: 0, synced: 0, failed: 0 };
  }
}

// Verifies credentials without creating anything.
async function testConnection(cfg = getConfig()) {
  if (!isConfigured(cfg)) return { ok: false, error: 'Chatwoot not configured — save Base URL, Account ID and API token first.' };
  try {
    const res = await fetchWithTimeout(apiUrl(cfg, '/contacts?page=1'), { method: 'GET', headers: headers(cfg) });
    if (res.ok) return { ok: true, error: null };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Unauthorized — use the Access Token from Chatwoot Profile Settings on an administrator account.' };
    }
    if (res.status === 404) return { ok: false, error: 'Not found — check the Base URL and Account ID.' };
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: `HTTP ${res.status}: ${extractError(json)}` };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

module.exports = {
  getConfig, isConfigured, pushContact, testConnection,
  recordSync, syncedUserIds, syncStats, toE164, toContactPayload,
};
