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

module.exports = { sendMessage, isConfigured, getConfig };
