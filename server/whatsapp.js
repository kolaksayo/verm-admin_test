const { getDb: getSQLite } = require('./sqlite');

const WHAPI_URL = 'https://gate.whapi.cloud/messages/text';

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      token:   get('whatsapp_api_token') || process.env.WHATSAPP_API_TOKEN || '',
      groupId: get('whatsapp_group_id')  || process.env.WHATSAPP_GROUP_ID  || '',
    };
  } catch {
    return {
      token:   process.env.WHATSAPP_API_TOKEN || '',
      groupId: process.env.WHATSAPP_GROUP_ID  || '',
    };
  }
}

// WhatsApp doesn't support HTML — strip all tags before sending
function stripHtml(text) {
  return text.replace(/<[^>]+>/g, '');
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
  const { token, groupId } = getConfig();
  const plain = stripHtml(text);

  if (!token || !groupId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const res  = await fetch(WHAPI_URL, {
      method:  'POST',
      headers: {
        'Accept':        'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ to: groupId, body: plain }),
    });
    const json = await res.json();
    const ok   = res.ok && !json.error;
    const errMsg = ok ? null : (json.error?.message || json.message || 'api_error');
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

function isConfigured() {
  const { token, groupId } = getConfig();
  return !!(token && groupId);
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
  const { token } = getConfig();
  const digits = phone.replace(/\D/g, '');
  if (!token || !digits) {
    logUserDm(userId, phone, username, trigger, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  const to = `${digits}@s.whatsapp.net`;
  try {
    const res = await fetch(WHAPI_URL, {
      method:  'POST',
      headers: {
        'Accept':        'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ to, body: plain }),
    });
    const json = await res.json();
    const ok   = res.ok && !json.error;
    const errMsg = ok ? null : (json.error?.message || json.message || 'api_error');
    logUserDm(userId, phone, username, trigger, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    logUserDm(userId, phone, username, trigger, false, err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = { sendMessage, sendDM, isConfigured, getConfig, stripHtml, DEFAULT_WELCOME_TEMPLATE };
