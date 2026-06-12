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

// Separate credentials for direct messages (welcome, settled-bet DMs).
// Falls back to the shared group config if DM-specific keys are not set.
function getDmConfig() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    const shared = getConfig();
    return {
      evolutionUrl:      get('dm_evolution_api_url')  || shared.evolutionUrl,
      evolutionApiKey:   get('dm_evolution_api_key')  || shared.evolutionApiKey,
      evolutionInstance: get('dm_evolution_instance') || shared.evolutionInstance,
    };
  } catch {
    const shared = getConfig();
    return {
      evolutionUrl:      shared.evolutionUrl,
      evolutionApiKey:   shared.evolutionApiKey,
      evolutionInstance: shared.evolutionInstance,
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
  const cfg = getDmConfig();
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
  const cfg = getDmConfig();
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

async function sendWelcomeTemplate(userId, phone, username) {
  const cfg = getDmConfig();
  const digits = normalizePhone(phone);

  if (!digits) {
    logUserDm(userId, phone, username, 'user_registered', false, 'no_phone');
    return { ok: false, reason: 'no_phone' };
  }

  if (!cfg.evolutionUrl || !cfg.evolutionApiKey || !cfg.evolutionInstance) {
    logUserDm(userId, phone, username, 'user_registered', false, 'not_configured');
    return { ok: false, reason: 'not_configured' };
  }

  let templateName = '';
  let templateLanguage = '';
  try {
    const sqlite = getSQLite();
    const get = (k) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
    templateName = get('welcome_template_name');
    templateLanguage = get('welcome_template_language');
  } catch { /* fall through to text fallback */ }

  try {
    let ok, json;
    if (templateName && templateLanguage) {
      ({ ok, json } = await evolutionPostTemplate(digits, templateName, templateLanguage, [username || 'there'], cfg));
    } else {
      // Fallback: send as plain text if template not configured
      const text = `Welcome to VermoSports, ${username || 'there'}! ⚽\n\nYou're officially part of the VermoSports community.\n\nStay updated with football competitions, rankings, match updates and important VermoSports announcements.\n\n18+ only. Play responsibly.`;
      ({ ok, json } = await evolutionPost(digits, text, cfg));
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
  const { evolutionUrl, evolutionApiKey, evolutionInstance, groupId } = getConfig();
  return !!(evolutionUrl && evolutionApiKey && evolutionInstance && groupId);
}

function isDmConfigured() {
  const { evolutionUrl, evolutionApiKey, evolutionInstance } = getDmConfig();
  return !!(evolutionUrl && evolutionApiKey && evolutionInstance);
}

// ── Health probes ───────────────────────────────────────────────────────────

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

async function checkDmHealth() {
  const cfg = getDmConfig();
  const result = {
    configured:        !!(cfg.evolutionUrl && cfg.evolutionApiKey && cfg.evolutionInstance),
    urlReachable:      false,
    apiKeyValid:       false,
    instanceConnected: false,
    state:             null,
    checkedAt:         new Date().toISOString(),
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
    // network error / timeout
  }

  return result;
}

module.exports = {
  sendMessage,
  sendDM,
  sendDirectMessage,
  sendToChannel,
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
