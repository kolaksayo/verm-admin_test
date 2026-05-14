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

async function sendMessage(text) {
  const { token, chatId } = getConfig();
  if (!token || !chatId) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      },
    );
    return await res.json();
  } catch (err) {
    console.error('[Telegram] send error:', err.message);
    return { ok: false, reason: err.message };
  }
}

function isConfigured() {
  const { token, chatId } = getConfig();
  return !!(token && chatId);
}

module.exports = { sendMessage, isConfigured, getConfig };
