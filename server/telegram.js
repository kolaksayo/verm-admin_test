const { getDb: getSQLite } = require('./sqlite');

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      token:  get('telegram_bot_token')  || process.env.TELEGRAM_BOT_TOKEN  || '',
      chatId: get('telegram_chat_id')    || process.env.TELEGRAM_CHAT_ID    || '',
    };
  } catch {
    return {
      token:  process.env.TELEGRAM_BOT_TOKEN  || '',
      chatId: process.env.TELEGRAM_CHAT_ID    || '',
    };
  }
}

function logSend(trigger, text, ok, error = null) {
  const preview = text.replace(/<[^>]+>/g, '').slice(0, 200);
  try {
    getSQLite().prepare(`
      INSERT INTO telegram_logs (trigger, preview, message, ok, error, channel)
      VALUES (?, ?, ?, ?, ?, 'telegram')
    `).run(trigger, preview, text || null, ok ? 1 : 0, error);
  } catch { /* non-fatal */ }
}

async function sendMessage(text, trigger = 'manual', _isRetry = false) {
  const { token, chatId } = getConfig();

  if (!token || !chatId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      },
    );
    const json = await res.json();
    logSend(trigger, text, json.ok, json.ok ? null : (json.description || 'api_error'));
    if (!json.ok && !_isRetry) {
      setTimeout(() => sendMessage(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return json;
  } catch (err) {
    logSend(trigger, text, false, err.message);
    console.error('[Telegram] send error:', err.message);
    if (!_isRetry) {
      setTimeout(() => sendMessage(text, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason: err.message };
  }
}

function isConfigured() {
  const { token, chatId } = getConfig();
  return !!(token && chatId);
}

// ── Health probe ────────────────────────────────────────────────────────────
// Verifies the bot token + chat without sending a broadcast message.
async function checkHealth() {
  const { token, chatId } = getConfig();
  const result = {
    configured:    !!(token && chatId),
    apiReachable:  false,
    botTokenValid: false,
    botUsername:   null,
    chatIdValid:   false,
    chatTitle:     null,
    canSend:       false,
    checkedAt:     new Date().toISOString(),
  };
  if (!token) return result;

  const tgGet = async (method, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const url = `https://api.telegram.org/bot${token}/${method}${qs ? '?' + qs : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      return await res.json().catch(() => ({}));
    } finally {
      clearTimeout(timer);
    }
  };

  let botId = null;
  try {
    const me = await tgGet('getMe');
    result.apiReachable = true;
    result.botTokenValid = !!me.ok;
    if (me.ok) {
      botId = me.result?.id;
      result.botUsername = me.result?.username ? '@' + me.result.username : null;
    }
  } catch {
    return result; // network error — apiReachable stays false
  }

  if (!result.botTokenValid || !chatId) return result;

  try {
    const chat = await tgGet('getChat', { chat_id: chatId });
    result.chatIdValid = !!chat.ok;
    if (chat.ok) result.chatTitle = chat.result?.title || chat.result?.username || null;
  } catch { /* leave chatIdValid false */ }

  if (result.chatIdValid && botId) {
    try {
      const mem = await tgGet('getChatMember', { chat_id: chatId, user_id: botId });
      if (mem.ok) {
        const st = mem.result?.status;
        if (st === 'administrator' || st === 'creator') result.canSend = true;
        else if (st === 'member') result.canSend = true;
        else if (st === 'restricted') result.canSend = !!mem.result?.can_send_messages;
        else result.canSend = false;
      }
    } catch { /* leave canSend false */ }
  }

  return result;
}

module.exports = { sendMessage, isConfigured, getConfig, checkHealth };
