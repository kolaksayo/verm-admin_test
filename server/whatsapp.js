const { getDb: getSQLite } = require('./sqlite');

const WHAPI_URL    = 'https://gate.whapi.cloud/messages/text';
const INTERAKT_URL = 'https://api.interakt.ai/v1/public/message/';
const FETCH_TIMEOUT_MS = 15000;

const DEFAULT_INTERAKT_TEMPLATE = 'welcome_to_vermosports';

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    const whapiToken       = get('whatsapp_api_token') || process.env.WHATSAPP_API_TOKEN || '';
    const interaktApiKey   = get('whatsapp_api_key')   || process.env.WHATSAPP_API_KEY   || '';
    const interaktTemplateName = get('whatsapp_interakt_template')
      || process.env.WHATSAPP_INTERAKT_TEMPLATE
      || DEFAULT_INTERAKT_TEMPLATE;
    return {
      whapiToken,
      interaktApiKey,
      interaktTemplateName,
      groupId:   get('whatsapp_group_id')   || process.env.WHATSAPP_GROUP_ID   || '',
      channelId: get('whatsapp_channel_id') || process.env.WHATSAPP_CHANNEL_ID || '',
    };
  } catch {
    return {
      whapiToken:            process.env.WHATSAPP_API_TOKEN || '',
      interaktApiKey:        process.env.WHATSAPP_API_KEY   || '',
      interaktTemplateName:  process.env.WHATSAPP_INTERAKT_TEMPLATE || DEFAULT_INTERAKT_TEMPLATE,
      groupId:               process.env.WHATSAPP_GROUP_ID   || '',
      channelId:             process.env.WHATSAPP_CHANNEL_ID || '',
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

// ── whapi.cloud helper ────────────────────────────────────────────────────────

async function whapiPost(to, text, whapiToken) {
  const res = await fetchWithTimeout(WHAPI_URL, {
    method:  'POST',
    headers: {
      'Accept':        'application/json',
      'Authorization': `Bearer ${whapiToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ to, body: text }),
  });
  const json = await res.json().catch(() => ({}));
  const ok   = res.ok && json.sent !== false && !json.error;
  return { ok, json };
}

// ── Interakt.ai template helper (welcome only) ────────────────────────────────

async function interaktWelcome(phone, name, interaktApiKey, templateName) {
  const res = await fetchWithTimeout(INTERAKT_URL, {
    method:  'POST',
    headers: {
      'Accept':        'application/json',
      'Authorization': `Basic ${interaktApiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      fullPhoneNumber: phone,
      type: 'Template',
      template: {
        name:         templateName,
        languageCode: 'en',
        headerValues: [],
        bodyValues:   [name],
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  const ok   = res.ok && json.result !== false;
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
  const { whapiToken, groupId } = getConfig();
  const plain = stripHtml(text);

  if (!whapiToken || !groupId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await whapiPost(groupId, plain, whapiToken);
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
  const { whapiToken, channelId } = getConfig();
  const plain = stripHtml(text);

  if (!whapiToken || !channelId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await whapiPost(channelId, plain, whapiToken);
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
  const { whapiToken } = getConfig();
  const digits = normalizePhone(phone);
  if (!whapiToken || !digits) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  try {
    const to = `${digits}@s.whatsapp.net`;
    const { ok, json } = await whapiPost(to, plain, whapiToken);
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
  const { whapiToken, interaktApiKey, interaktTemplateName } = getConfig();
  const digits = normalizePhone(phone);

  if (!digits) {
    logUserDm(userId, phone, username, trigger, false, 'no_phone');
    return { ok: false, reason: 'no_phone' };
  }

  // Welcome message → Interakt.ai template
  if (trigger === 'user_registered') {
    if (!interaktApiKey) {
      logUserDm(userId, phone, username, trigger, false, 'not_configured');
      return { ok: false, reason: 'not_configured' };
    }
    const name = username || 'there';
    try {
      const { ok, json } = await interaktWelcome(digits, name, interaktApiKey, interaktTemplateName);
      const errMsg = ok ? null : (json.message || 'api_error');
      logUserDm(userId, phone, username, trigger, ok, errMsg);
      return ok ? { ok: true } : { ok: false, reason: errMsg };
    } catch (err) {
      const reason = err.name === 'AbortError' ? 'timeout' : err.message;
      logUserDm(userId, phone, username, trigger, false, reason);
      return { ok: false, reason };
    }
  }

  // All other DMs → whapi.cloud
  if (!whapiToken) {
    logUserDm(userId, phone, username, trigger, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  try {
    const to = `${digits}@s.whatsapp.net`;
    const { ok, json } = await whapiPost(to, plain, whapiToken);
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
  const { whapiToken, groupId } = getConfig();
  return !!(whapiToken && groupId);
}

function isWelcomeConfigured() {
  const { interaktApiKey } = getConfig();
  return !!interaktApiKey;
}

module.exports = {
  sendMessage,
  sendDM,
  sendDirectMessage,
  sendToChannel,
  isConfigured,
  isWelcomeConfigured,
  getConfig,
  stripHtml,
  normalizePhone,
};
