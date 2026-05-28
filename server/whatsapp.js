const { getDb: getSQLite } = require('./sqlite');

const INTERAKT_URL = 'https://api.interakt.ai/v1/public/message/';
const FETCH_TIMEOUT_MS = 15000;

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    // Support both whatsapp_api_key (new) and whatsapp_api_token (legacy)
    const apiKey = get('whatsapp_api_key') || get('whatsapp_api_token')
      || process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_API_TOKEN || '';
    return {
      apiKey,
      groupId:   get('whatsapp_group_id')   || process.env.WHATSAPP_GROUP_ID   || '',
      channelId: get('whatsapp_channel_id') || process.env.WHATSAPP_CHANNEL_ID || '',
    };
  } catch {
    return {
      apiKey:    process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_API_TOKEN || '',
      groupId:   process.env.WHATSAPP_GROUP_ID   || '',
      channelId: process.env.WHATSAPP_CHANNEL_ID || '',
    };
  }
}

// WhatsApp doesn't support HTML — strip all tags before sending
function stripHtml(text) {
  return text.replace(/<[^>]+>/g, '');
}

function interaktBody(fullPhoneNumber, message) {
  return JSON.stringify({
    fullPhoneNumber,
    type: 'Text',
    data: { message },
  });
}

function logSend(trigger, text, ok, error = null) {
  const plain   = stripHtml(text);
  const preview = plain.slice(0, 200);
  try {
    getSQLite().prepare(`
      INSERT INTO telegram_logs (trigger, preview, message, ok, error, channel)
      VALUES (?, ?, ?, ?, ?, 'whatsapp')
    `).run(trigger, preview, text || null, ok ? 1 : 0, error);
  } catch { /* non-fatal */ }
}

async function sendMessage(text, trigger = 'manual', _isRetry = false) {
  const { apiKey, groupId } = getConfig();
  const plain = stripHtml(text);

  if (!apiKey || !groupId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res = await fetchWithTimeout(INTERAKT_URL, {
      method:  'POST',
      headers: {
        'Accept':        'application/json',
        'Authorization': `Basic ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: interaktBody(groupId, plain),
    });
    const json = await res.json().catch(() => ({}));
    const ok   = res.ok && json.result !== false;
    const errMsg = ok ? null : (json.message || 'api_error');
    logSend(trigger, text, ok, errMsg);
    if (!ok && !_isRetry) {
      setTimeout(() => sendMessage(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    logSend(trigger, text, false, err.message);
    console.error('[WhatsApp] send error:', err.message);
    if (!_isRetry) {
      setTimeout(() => sendMessage(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason: err.message };
  }
}

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

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function isConfigured() {
  const { apiKey, groupId } = getConfig();
  return !!(apiKey && groupId);
}

const DEFAULT_WELCOME_TEMPLATE = `Welcome to Vermö! 🎉

Hi {{name}}, thanks for joining.

📣 Join our WhatsApp group to chat with other players:
{{group_link}}

🔔 Follow our WhatsApp channel for match updates & announcements:
{{channel_link}}

Good luck! 🏆`;

function logUserDm(userId, phone, username, trigger, ok, error = null) {
  try {
    getSQLite().prepare(`
      INSERT OR REPLACE INTO whatsapp_user_dms (user_id, phone, username, trigger, ok, error, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(userId || '', phone, username || null, trigger, ok ? 1 : 0, error);
  } catch { /* non-fatal */ }
}

async function sendDM(userId, phone, username, text, trigger = 'user_registered') {
  const { apiKey } = getConfig();
  const digits = normalizePhone(phone);
  if (!apiKey || !digits) {
    logUserDm(userId, phone, username, trigger, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  try {
    const res = await fetchWithTimeout(INTERAKT_URL, {
      method:  'POST',
      headers: {
        'Accept':        'application/json',
        'Authorization': `Basic ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: interaktBody(digits, plain),
    });
    const json = await res.json().catch(() => ({}));
    const ok   = res.ok && json.result !== false;
    const errMsg = ok ? null : (json.message || 'api_error');
    logUserDm(userId, phone, username, trigger, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logUserDm(userId, phone, username, trigger, false, reason);
    return { ok: false, reason };
  }
}

async function sendDirectMessage(phone, text, trigger = 'manual') {
  const { apiKey } = getConfig();
  const digits = normalizePhone(phone);
  if (!apiKey || !digits) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  try {
    const res = await fetchWithTimeout(INTERAKT_URL, {
      method:  'POST',
      headers: {
        'Accept':        'application/json',
        'Authorization': `Basic ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: interaktBody(digits, plain),
    });
    const json = await res.json().catch(() => ({}));
    const ok   = res.ok && json.result !== false;
    const errMsg = ok ? null : (json.message || 'api_error');
    logSend(trigger, text, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logSend(trigger, text, false, reason);
    return { ok: false, reason };
  }
}

async function sendToChannel(text, trigger = 'manual', _isRetry = false) {
  const { apiKey, channelId } = getConfig();
  const plain = stripHtml(text);

  if (!apiKey || !channelId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res = await fetchWithTimeout(INTERAKT_URL, {
      method:  'POST',
      headers: {
        'Accept':        'application/json',
        'Authorization': `Basic ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: interaktBody(channelId, plain),
    });
    const json = await res.json().catch(() => ({}));
    const ok   = res.ok && json.result !== false;
    const errMsg = ok ? null : (json.message || 'api_error');
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

module.exports = { sendMessage, sendDM, sendDirectMessage, sendToChannel, isConfigured, getConfig, stripHtml, DEFAULT_WELCOME_TEMPLATE, normalizePhone };
