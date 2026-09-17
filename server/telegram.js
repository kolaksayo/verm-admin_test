const { getDb: getSQLite } = require('./sqlite');

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      token:     get('telegram_bot_token')  || process.env.TELEGRAM_BOT_TOKEN  || '',
      chatId:    get('telegram_chat_id')    || process.env.TELEGRAM_CHAT_ID    || '',
      channelId: get('telegram_channel_id') || process.env.TELEGRAM_CHANNEL_ID || '',
    };
  } catch {
    return {
      token:     process.env.TELEGRAM_BOT_TOKEN  || '',
      chatId:    process.env.TELEGRAM_CHAT_ID    || '',
      channelId: process.env.TELEGRAM_CHANNEL_ID || '',
    };
  }
}

/**
 * Canonicalises a channel identifier.
 *
 * Public channels are '@name'. Private ones are always the -100-prefixed form,
 * but the id shown in web.telegram.org URLs (…/c/1234567890/…) and in most
 * bot helpers omits that prefix, and sending to the bare number returns
 * 'Bad Request: chat not found'. Add the prefix when it is missing so a
 * pasted id works as-is.
 */
function normalizeChatId(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (v.startsWith('@')) return v;                 // public @name
  if (/^-100\d+$/.test(v)) return v;               // already canonical
  if (/^\d+$/.test(v)) return `-100${v}`;          // bare id from a URL
  if (/^-\d+$/.test(v)) return `-100${v.slice(1)}`; // negative, missing 100
  return v;                                        // leave anything else alone
}

// `channel` distinguishes group sends ('telegram') from channel sends
// ('telegram_channel') in the Broadcast Send Log.
function logSend(trigger, text, ok, error = null, channel = 'telegram') {
  const preview = String(text || '').replace(/<[^>]+>/g, '').slice(0, 200);
  try {
    getSQLite().prepare(`
      INSERT INTO telegram_logs (trigger, preview, message, ok, error, channel)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(trigger, preview, text || null, ok ? 1 : 0, error, channel);
  } catch { /* non-fatal */ }
}

// Core text send, parameterised by destination so the group and the channel
// share one implementation (guard, logging, one-shot 5-minute retry).
async function postText({ token, target, logChannel }, text, trigger, _isRetry, retry) {
  if (!token || !target) {
    logSend(trigger, text, false, 'not_configured', logChannel);
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: target, text, parse_mode: 'HTML' }),
      },
    );
    const json = await res.json();
    logSend(trigger, text, json.ok, json.ok ? null : (json.description || 'api_error'), logChannel);
    if (!json.ok && !_isRetry) {
      setTimeout(() => retry().catch(() => {}), 5 * 60 * 1000);
    }
    return json;
  } catch (err) {
    logSend(trigger, text, false, err.message, logChannel);
    console.error('[Telegram] send error:', err.message);
    if (!_isRetry) {
      setTimeout(() => retry().catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason: err.message };
  }
}

async function sendMessage(text, trigger = 'manual', _isRetry = false) {
  const { token, chatId } = getConfig();
  return postText({ token, target: chatId, logChannel: 'telegram' }, text, trigger, _isRetry,
    () => sendMessage(text, trigger, true));
}

// Same message, sent to the Telegram channel. The bot must be an administrator
// of the channel for this to succeed.
async function sendToChannel(text, trigger = 'manual', _isRetry = false) {
  const { token, channelId } = getConfig();
  return postText({ token, target: channelId, logChannel: 'telegram_channel' }, text, trigger, _isRetry,
    () => sendToChannel(text, trigger, true));
}

// Photo with caption — multipart upload of an in-memory buffer. Same shape as
// sendMessage (config guard, logSend on the caption, one-shot 5-minute retry
// whose closure holds the buffer), plus a 15s timeout on the upload.
async function postPhoto({ token, target, logChannel }, imageBuffer, mimetype, filename, caption, trigger, _isRetry, retry) {
  if (!token || !target) {
    logSend(trigger, caption, false, 'not_configured', logChannel);
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const form = new FormData();
    form.append('chat_id', target);
    form.append('photo', new Blob([imageBuffer], { type: mimetype }), filename || 'image');
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res;
    try {
      // No manual Content-Type — fetch sets the multipart boundary itself.
      res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const json = await res.json();
    logSend(trigger, caption, json.ok, json.ok ? null : (json.description || 'api_error'), logChannel);
    if (!json.ok && !_isRetry) {
      setTimeout(() => retry().catch(() => {}), 5 * 60 * 1000);
    }
    return json;
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logSend(trigger, caption, false, reason, logChannel);
    console.error('[Telegram] sendPhoto error:', reason);
    if (!_isRetry) {
      setTimeout(() => retry().catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason };
  }
}

async function sendPhoto(imageBuffer, mimetype, filename, caption, trigger = 'manual', _isRetry = false) {
  const { token, chatId } = getConfig();
  return postPhoto({ token, target: chatId, logChannel: 'telegram' },
    imageBuffer, mimetype, filename, caption, trigger, _isRetry,
    () => sendPhoto(imageBuffer, mimetype, filename, caption, trigger, true));
}

async function sendPhotoToChannel(imageBuffer, mimetype, filename, caption, trigger = 'manual', _isRetry = false) {
  const { token, channelId } = getConfig();
  return postPhoto({ token, target: channelId, logChannel: 'telegram_channel' },
    imageBuffer, mimetype, filename, caption, trigger, _isRetry,
    () => sendPhotoToChannel(imageBuffer, mimetype, filename, caption, trigger, true));
}

function isConfigured() {
  const { token, chatId } = getConfig();
  return !!(token && chatId);
}

// Channel mirroring is opt-in: it only happens once a channel ID is saved.
function isChannelConfigured() {
  const { token, channelId } = getConfig();
  return !!(token && channelId);
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

module.exports = {
  sendMessage, sendPhoto,
  sendToChannel, sendPhotoToChannel,
  isConfigured, isChannelConfigured,
  getConfig, checkHealth, normalizeChatId,
};
