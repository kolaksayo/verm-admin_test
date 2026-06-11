const { getDb: getSQLite } = require('./sqlite');

const FETCH_TIMEOUT_MS = 15000;

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      evolutionUrl:      get('evolution_api_url')  || process.env.EVOLUTION_API_URL      || '',
      evolutionApiKey:   get('evolution_api_key')  || process.env.EVOLUTION_API_KEY      || '',
      evolutionInstance: get('evolution_instance') || process.env.EVOLUTION_INSTANCE     || '',
      groupId:           get('whatsapp_group_id')  || process.env.WHATSAPP_GROUP_ID      || '',
      channelId:         get('whatsapp_channel_id')|| process.env.WHATSAPP_CHANNEL_ID    || '',
    };
  } catch {
    return {
      evolutionUrl:      process.env.EVOLUTION_API_URL      || '',
      evolutionApiKey:   process.env.EVOLUTION_API_KEY      || '',
      evolutionInstance: process.env.EVOLUTION_INSTANCE     || '',
      groupId:           process.env.WHATSAPP_GROUP_ID      || '',
      channelId:         process.env.WHATSAPP_CHANNEL_ID    || '',
    };
  }
}

function stripHtml(text) {
  return text.replace(/<[^>]+>/g, '');
}

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Evolution API helper ──────────────────────────────────────────────────────

async function evolutionPost(to, text, { evolutionUrl: url, evolutionApiKey: apiKey, evolutionInstance: instance }) {
  const res = await fetchWithTimeout(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: to, text }),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && !!(json.key?.id);
  return { ok, json };
}

// ── Logging helpers ───────────────────────────────────────────────────────────

function logSend(trigger, text, ok, error = null) {
  const plain   = stripHtml(text || '');
  const preview = plain.slice(0, 200);
  try {
    getSQLite().prepare(`
      INSERT INTO telegram_logs (trigger, preview, message, ok, error, channel)
      VALUES (?, ?, ?, ?, ?, 'whatsapp')
    `).run(trigger, preview, text || null, ok ? 1 : 0, error);
  } catch { /* non-fatal */ }
}

function logUserDm(userId, phone, username, trigger, ok, error = null) {
  try {
    getSQLite().prepare(`
      INSERT OR REPLACE INTO whatsapp_user_dms (user_id, phone, username, trigger, ok, error, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(userId || '', phone, username || null, trigger, ok ? 1 : 0, error);
  } catch { /* non-fatal */ }
}

// ── normalizePhone ────────────────────────────────────────────────────────────

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return digits;
  if (digits.startsWith('0')) {
    try {
      const sqlite = getSQLite();
      const cc = sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get('whatsapp_country_code')?.value || '';
      const code = cc.replace(/\D/g, '') || '234';
      return code + digits.slice(1);
    } catch {
      return '234' + digits.slice(1);
    }
  }
  return digits;
}

// ── Public send functions ─────────────────────────────────────────────────────

async function sendMessage(text, trigger = 'manual', _isRetry = false) {
  const cfg = getConfig();
  const plain = stripHtml(text);

  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance || !cfg.groupId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await evolutionPost(cfg.groupId, plain, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logSend(trigger, text, ok, errMsg);
    if (!ok && !_isRetry) {
      setTimeout(() => sendMessage(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    logSend(trigger, text, false, err.message);
    console.error('[WhatsApp] sendMessage error:', err.message);
    if (!_isRetry) {
      setTimeout(() => sendMessage(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason: err.message };
  }
}

async function sendToChannel(text, trigger = 'manual', _isRetry = false) {
  const cfg = getConfig();
  const plain = stripHtml(text);

  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance || !cfg.channelId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await evolutionPost(cfg.channelId, plain, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logSend(trigger, text, ok, errMsg);
    if (!ok && !_isRetry) {
      setTimeout(() => sendToChannel(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logSend(trigger, text, false, reason);
    if (!_isRetry) {
      setTimeout(() => sendToChannel(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason };
  }
}

async function sendDirectMessage(phone, text, trigger = 'manual') {
  const cfg = getConfig();
  const digits = normalizePhone(phone);
  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance || !digits) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  try {
    const { ok, json } = await evolutionPost(digits, plain, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logSend(trigger, text, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logSend(trigger, text, false, reason);
    return { ok: false, reason };
  }
}

async function sendDM(userId, phone, username, text, trigger = 'user_registered') {
  const cfg = getConfig();
  const digits = normalizePhone(phone);

  if (!digits) {
    logUserDm(userId, phone, username, trigger, false, 'no_phone');
    return { ok: false, reason: 'no_phone' };
  }

  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance) {
    logUserDm(userId, phone, username, trigger, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  const plain = stripHtml(text);
  try {
    const { ok, json } = await evolutionPost(digits, plain, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logUserDm(userId, phone, username, trigger, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logUserDm(userId, phone, username, trigger, false, reason);
    return { ok: false, reason };
  }
}

// ── Status checks ─────────────────────────────────────────────────────────────

function isConfigured() {
  const { evolutionUrl, evolutionApiKey, evolutionInstance, groupId } = getConfig();
  return !!(evolutionUrl && evolutionApiKey && evolutionInstance && groupId);
}

// ── Health probe ────────────────────────────────────────────────────────────
// Verifies the Evolution connection without sending a message.
async function checkHealth() {
  const cfg = getConfig();
  const result = {
    configured:          !!(cfg.evolutionUrl && cfg.evolutionApiKey && cfg.evolutionInstance),
    urlReachable:        false,
    apiKeyValid:         false,
    instanceConnected:   false,
    state:               null,
    groupIdConfigured:   /@g\.us$/.test(cfg.groupId || ''),
    channelIdConfigured: /@newsletter$/.test(cfg.channelId || ''),
    checkedAt:           new Date().toISOString(),
  };
  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance) return result;

  try {
    const res = await fetchWithTimeout(
      `${cfg.evolutionUrl}/instance/connectionState/${cfg.evolutionInstance}`,
      { method: 'GET', headers: { 'apikey': cfg.evolutionApiKey } },
    );
    result.urlReachable = true;
    result.apiKeyValid = res.status !== 401 && res.status !== 403;
    const json = await res.json().catch(() => ({}));
    const state = json.instance?.state || json.state || null;
    result.state = state;
    result.instanceConnected = state === 'open';
  } catch {
    // network error / timeout — urlReachable stays false
  }

  return result;
}

module.exports = {
  sendMessage,
  sendDM,
  sendDirectMessage,
  sendToChannel,
  isConfigured,
  getConfig,
  stripHtml,
  normalizePhone,
  checkHealth,
};
