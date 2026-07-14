const { getDb: getSQLite } = require('./sqlite');

const FETCH_TIMEOUT_MS = 15000;

function getConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      provider:          get('whatsapp_provider')   || 'evolution',
      evolutionUrl:      get('evolution_api_url')  || process.env.EVOLUTION_API_URL      || '',
      evolutionApiKey:   get('evolution_api_key')  || process.env.EVOLUTION_API_KEY      || '',
      evolutionInstance: get('evolution_instance') || process.env.EVOLUTION_INSTANCE     || '',
      whapiToken:        get('whapi_api_token')     || '',
      groupId:           get('whatsapp_group_id')  || process.env.WHATSAPP_GROUP_ID      || '',
      channelId:         get('whatsapp_channel_id')|| process.env.WHATSAPP_CHANNEL_ID    || '',
      method:            get('evolution_method')   || 'baileys',
    };
  } catch {
    return {
      provider:          'evolution',
      evolutionUrl:      process.env.EVOLUTION_API_URL      || '',
      evolutionApiKey:   process.env.EVOLUTION_API_KEY      || '',
      evolutionInstance: process.env.EVOLUTION_INSTANCE     || '',
      whapiToken:        '',
      groupId:           process.env.WHATSAPP_GROUP_ID      || '',
      channelId:         process.env.WHATSAPP_CHANNEL_ID    || '',
      method:            'baileys',
    };
  }
}

// Separate credentials for direct messages (welcome, settled-bet DMs).
// Fully independent from the group/channel config — no fallback. A one-time
// seed migration in sqlite.js copies the group Evolution values into the dm_*
// keys for pre-existing installs that relied on the old implicit fallback.
function getDmConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return {
      provider:          get('dm_whatsapp_provider')  || 'evolution',
      evolutionUrl:      get('dm_evolution_api_url')  || '',
      evolutionApiKey:   get('dm_evolution_api_key')  || '',
      evolutionInstance: get('dm_evolution_instance') || '',
      whapiToken:        get('dm_whapi_api_token')    || '',
      method:            get('dm_evolution_method')   || 'baileys',
    };
  } catch {
    return {
      provider:          'evolution',
      evolutionUrl:      '',
      evolutionApiKey:   '',
      evolutionInstance: '',
      whapiToken:        '',
      method:            'baileys',
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

// ── Evolution API helpers ─────────────────────────────────────────────────────

async function evolutionPost(to, text, { evolutionUrl: url, evolutionApiKey: apiKey, evolutionInstance: instance }) {
  if (!/^[\x00-\x7F]+$/.test(apiKey || '')) throw new Error('api_key_invalid: stored key contains non-ASCII characters — re-enter the full API key in Settings');
  const res = await fetchWithTimeout(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: to, text }),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && !!(json.key?.id);
  return { ok, json };
}

async function evolutionPostTemplate(to, templateName, languageCode, bodyParams, { evolutionUrl: url, evolutionApiKey: apiKey, evolutionInstance: instance }) {
  if (!/^[\x00-\x7F]+$/.test(apiKey || '')) throw new Error('api_key_invalid: stored key contains non-ASCII characters — re-enter the full API key in Settings');
  const res = await fetchWithTimeout(`${url}/message/sendTemplate/${instance}`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number: to,
      templateName,
      language: languageCode,
      components: [
        {
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text })),
        },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && !!(json.key?.id);
  return { ok, json };
}

// ── Whapi.Cloud helpers ───────────────────────────────────────────────────────

const WHAPI_BASE_URL = 'https://gate.whapi.cloud';

// whapi accepts `to` as bare intl digits (2348012345678), a contact JID
// (...@s.whatsapp.net), a group JID (...@g.us), or a newsletter ID — so the
// same target strings used with Evolution pass through unchanged.
async function whapiPost(to, text, { whapiToken: token }) {
  if (!/^[\x00-\x7F]+$/.test(token || '')) throw new Error('api_key_invalid: stored whapi token contains non-ASCII characters — re-enter the full token in Settings');
  const res = await fetchWithTimeout(`${WHAPI_BASE_URL}/messages/text`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, body: text }),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && (json.sent === true || !!json.message?.id || !!json.id);
  return { ok, json };
}

// Provider dispatch — every text send funnels through here so the per-scope
// provider choice (cfg.provider from getConfig/getDmConfig) is honored without
// any call-site changes.
function dispatchText(to, text, cfg) {
  return cfg.provider === 'whapi' ? whapiPost(to, text, cfg) : evolutionPost(to, text, cfg);
}

// ── Media (image) helpers — mirror the text path ─────────────────────────────

async function evolutionPostMedia(to, { base64, mimetype, filename, caption }, { evolutionUrl: url, evolutionApiKey: apiKey, evolutionInstance: instance }) {
  if (!/^[\x00-\x7F]+$/.test(apiKey || '')) throw new Error('api_key_invalid: stored key contains non-ASCII characters — re-enter the full API key in Settings');
  const res = await fetchWithTimeout(`${url}/message/sendMedia/${instance}`, {
    method: 'POST',
    headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      number:    to,
      mediatype: 'image',
      mimetype,
      caption,
      media:     base64,   // raw base64, no data: prefix
      fileName:  filename,
    }),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && !!(json.key?.id);
  return { ok, json };
}

async function whapiPostMedia(to, { base64, mimetype, caption }, { whapiToken: token }) {
  if (!/^[\x00-\x7F]+$/.test(token || '')) throw new Error('api_key_invalid: stored whapi token contains non-ASCII characters — re-enter the full token in Settings');
  const res = await fetchWithTimeout(`${WHAPI_BASE_URL}/messages/image`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, media: `data:${mimetype};base64,${base64}`, caption }),
  });
  const json = await res.json().catch(() => ({}));
  const ok = res.ok && (json.sent === true || !!json.message?.id || !!json.id);
  return { ok, json };
}

function dispatchMedia(to, media, cfg) {
  return cfg.provider === 'whapi' ? whapiPostMedia(to, media, cfg) : evolutionPostMedia(to, media, cfg);
}

// A scope is send-ready when its selected provider has its own credentials.
function providerReady(cfg) {
  return cfg.provider === 'whapi'
    ? !!cfg.whapiToken
    : !!(cfg.evolutionUrl && cfg.evolutionApiKey && cfg.evolutionInstance);
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

  if (!providerReady(cfg) || !cfg.groupId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await dispatchText(cfg.groupId, plain, cfg);
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

  if (!providerReady(cfg) || !cfg.channelId) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await dispatchText(cfg.channelId, plain, cfg);
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

// Media mirrors of sendMessage/sendToChannel — same guards, logging (the caption
// is what gets logged), and one-shot 5-minute retry, with the retry closure
// holding the in-memory media object.
async function sendMediaMessage(media, trigger = 'manual', _isRetry = false) {
  const cfg = getConfig();
  const payload = { ...media, caption: stripHtml(media.caption || '') };

  if (!providerReady(cfg) || !cfg.groupId) {
    logSend(trigger, payload.caption, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await dispatchMedia(cfg.groupId, payload, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logSend(trigger, payload.caption, ok, errMsg);
    if (!ok && !_isRetry) {
      setTimeout(() => sendMediaMessage(media, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logSend(trigger, payload.caption, false, reason);
    if (!_isRetry) {
      setTimeout(() => sendMediaMessage(media, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason };
  }
}

async function sendMediaToChannel(media, trigger = 'manual', _isRetry = false) {
  const cfg = getConfig();
  const payload = { ...media, caption: stripHtml(media.caption || '') };

  if (!providerReady(cfg) || !cfg.channelId) {
    logSend(trigger, payload.caption, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await dispatchMedia(cfg.channelId, payload, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logSend(trigger, payload.caption, ok, errMsg);
    if (!ok && !_isRetry) {
      setTimeout(() => sendMediaToChannel(media, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logSend(trigger, payload.caption, false, reason);
    if (!_isRetry) {
      setTimeout(() => sendMediaToChannel(media, trigger, true).catch(() => {}), 5 * 60 * 1000);
    }
    return { ok: false, reason };
  }
}

async function sendDirectMessage(phone, text, trigger = 'manual') {
  const cfg = getDmConfig();
  const digits = normalizePhone(phone);
  if (!providerReady(cfg) || !digits) {
    logSend(trigger, text, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }
  const plain = stripHtml(text);
  try {
    const { ok, json } = await dispatchText(digits, plain, cfg);
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
  const cfg = getDmConfig();
  const digits = normalizePhone(phone);

  if (!digits) {
    logUserDm(userId, phone, username, trigger, false, 'no_phone');
    return { ok: false, reason: 'no_phone' };
  }

  if (!providerReady(cfg)) {
    logUserDm(userId, phone, username, trigger, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  const plain = stripHtml(text);
  try {
    const { ok, json } = await dispatchText(digits, plain, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logUserDm(userId, phone, username, trigger, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logUserDm(userId, phone, username, trigger, false, reason);
    return { ok: false, reason };
  }
}

// Media DM — mirrors sendDM but sends an image with the message as caption,
// using the DM-scope config. Same no_phone / not_configured guards + user-DM
// logging (the caption is what gets logged).
async function sendMediaDM(userId, phone, username, media, trigger = 'campaign_dm') {
  const cfg = getDmConfig();
  const digits = normalizePhone(phone);
  const payload = { ...media, caption: stripHtml(media?.caption || '') };

  if (!digits) {
    logUserDm(userId, phone, username, trigger, false, 'no_phone');
    return { ok: false, reason: 'no_phone' };
  }

  if (!providerReady(cfg)) {
    logUserDm(userId, phone, username, trigger, false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { ok, json } = await dispatchMedia(digits, payload, cfg);
    const errMsg = ok ? null : (json.message || json.error?.message || 'api_error');
    logUserDm(userId, phone, username, trigger, ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logUserDm(userId, phone, username, trigger, false, reason);
    return { ok: false, reason };
  }
}

async function sendWelcomeTemplate(userId, phone, username) {
  const cfg = getDmConfig();
  const digits = normalizePhone(phone);

  if (!digits) {
    logUserDm(userId, phone, username, 'user_registered', false, 'no_phone');
    return { ok: false, reason: 'no_phone' };
  }

  if (!providerReady(cfg)) {
    logUserDm(userId, phone, username, 'user_registered', false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  let groupLink = '', channelLink = '', telegramLink = '';
  let customWelcomeText = '';
  try {
    const sq = getSQLite();
    const sqGet = (k) => sq.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
    groupLink    = sqGet('whatsapp_group_link');
    channelLink  = sqGet('whatsapp_channel_link');
    telegramLink = sqGet('dm_telegram_link');
    const raw = sqGet('dm_welcome_text');
    if (raw) {
      customWelcomeText = raw
        .replace(/\{\{name\}\}/g, username || 'there')
        .replace(/\{\{1\}\}/g, username || 'there')
        .replace(/\{\{group_link\}\}/g, groupLink)
        .replace(/\{\{channel_link\}\}/g, channelLink)
        .replace(/\{\{telegram_link\}\}/g, telegramLink);
    }
  } catch { /* use default */ }

  const linkLines = [groupLink, channelLink, telegramLink].filter(Boolean).join('\n\n');
  const DEFAULT_WELCOME = [
    `Welcome to VermoSports, ${username || 'there'}! ⚽`,
    `You're officially part of the VermoSports community.`,
    `Stay updated with football competitions, rankings, match updates and important VermoSports announcements.`,
    `18+ only. Play responsibly.`,
    ...(linkLines ? [linkLines] : []),
  ].join('\n\n');

  const WELCOME_TEXT = customWelcomeText || DEFAULT_WELCOME;

  try {
    let ok, json;
    // Evolution cloud_api templates don't exist on whapi — whapi always sends
    // the plain-text welcome, same as the Baileys path.
    if (cfg.provider !== 'whapi' && cfg.method === 'cloud_api') {
      let templateName = '', templateLanguage = '';
      try {
        const sqlite = getSQLite();
        const get = (k) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
        templateName = get('welcome_template_name');
        templateLanguage = get('welcome_template_language');
      } catch { /* handled below */ }

      if (!templateName || !templateLanguage) {
        logUserDm(userId, phone, username, 'user_registered', false, 'template_not_configured');
        return { ok: false, reason: 'template_not_configured' };
      }
      ({ ok, json } = await evolutionPostTemplate(digits, templateName, templateLanguage, [username || 'there'], cfg));
    } else {
      // Baileys (default) or whapi: plain text
      ({ ok, json } = await dispatchText(digits, WELCOME_TEXT, cfg));
    }
    const errMsg = ok ? null : (json?.message || json?.error?.message || 'api_error');
    logUserDm(userId, phone, username, 'user_registered', ok, errMsg);
    return ok ? { ok: true } : { ok: false, reason: errMsg };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : err.message;
    logUserDm(userId, phone, username, 'user_registered', false, reason);
    return { ok: false, reason };
  }
}

// ── Status checks ─────────────────────────────────────────────────────────────

function isConfigured() {
  const cfg = getConfig();
  return providerReady(cfg) && !!cfg.groupId;
}

function isDmConfigured() {
  return providerReady(getDmConfig());
}

// ── Health probes ───────────────────────────────────────────────────────────

// Shared probe: Evolution hits /instance/connectionState, whapi hits
// gate.whapi.cloud/health. Both map onto the same result fields the UI reads
// (urlReachable / apiKeyValid / instanceConnected / state).
async function probeProvider(cfg, result) {
  if (cfg.provider === 'whapi') {
    if (!cfg.whapiToken) return;
    try {
      const res = await fetchWithTimeout(`${WHAPI_BASE_URL}/health`, {
        method: 'GET', headers: { 'Authorization': `Bearer ${cfg.whapiToken}` },
      });
      result.urlReachable = true;
      result.apiKeyValid = res.status !== 401 && res.status !== 403;
      const json = await res.json().catch(() => ({}));
      const status = json.status?.text || json.status || null;
      result.state = typeof status === 'string' ? status : null;
      result.instanceConnected = res.ok && result.apiKeyValid;
    } catch {
      // network error / timeout — urlReachable stays false
    }
    return;
  }

  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance) return;
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
}

async function checkHealth() {
  const cfg = getConfig();
  const result = {
    provider:            cfg.provider,
    configured:          providerReady(cfg),
    urlReachable:        false,
    apiKeyValid:         false,
    instanceConnected:   false,
    state:               null,
    groupIdConfigured:   /@g\.us$/.test(cfg.groupId || ''),
    channelIdConfigured: /@newsletter$/.test(cfg.channelId || ''),
    checkedAt:           new Date().toISOString(),
  };
  await probeProvider(cfg, result);
  return result;
}

async function checkDmHealth() {
  const cfg = getDmConfig();
  const result = {
    provider:          cfg.provider,
    configured:        providerReady(cfg),
    urlReachable:      false,
    apiKeyValid:       false,
    instanceConnected: false,
    state:             null,
    checkedAt:         new Date().toISOString(),
  };
  await probeProvider(cfg, result);
  return result;
}

module.exports = {
  sendMessage,
  sendDM,
  sendDirectMessage,
  sendToChannel,
  sendMediaMessage,
  sendMediaToChannel,
  sendMediaDM,
  sendWelcomeTemplate,
  isConfigured,
  isDmConfigured,
  getConfig,
  getDmConfig,
  stripHtml,
  normalizePhone,
  checkHealth,
  checkDmHealth,
};
