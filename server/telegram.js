const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;

async function sendMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
      },
    );
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('[Telegram] send error:', err.message);
    return { ok: false, reason: err.message };
  }
}

function isConfigured() {
  return !!(BOT_TOKEN && CHAT_ID);
}

module.exports = { sendMessage, isConfigured };
