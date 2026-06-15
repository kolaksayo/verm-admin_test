const express = require('express');
const { sendMessage, sendToChannel, isConfigured, getConfig, checkHealth } = require('../whatsapp');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');

const router = express.Router();

function getWhatsAppEnabled(sqlite) {
  const row = sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'whatsapp_enabled'").get();
  return row ? row.value !== '0' : true;
}

// GET /api/whatsapp/status
router.get('/status', auth, (req, res) => {
  const { evolutionUrl, evolutionApiKey, evolutionInstance, groupId, channelId } = getConfig();
  const sqlite = getSQLite();
  res.json({
    configured:            isConfigured(),
    evolutionUrlSet:       !!evolutionUrl,
    evolutionApiKeySet:    !!evolutionApiKey,
    evolutionInstanceSet:  !!evolutionInstance,
    evolutionApiKeyPreview: evolutionApiKey ? evolutionApiKey.slice(0, 8) + '…' + evolutionApiKey.slice(-4) : null,
    groupIdSet:            !!groupId,
    channelIdSet:          !!channelId,
    groupId:               groupId   || null,
    channelId:             channelId || null,
    enabled:               getWhatsAppEnabled(sqlite),
  });
});

// GET /api/whatsapp/config
router.get('/config', auth, (req, res) => {
  const { evolutionUrl, evolutionApiKey, evolutionInstance, groupId, channelId, method } = getConfig();
  const sqlite = getSQLite();
  res.json({
    evolutionUrl:      evolutionUrl      || '',
    evolutionApiKey:   evolutionApiKey   ? evolutionApiKey.slice(0, 8) + '…' + evolutionApiKey.slice(-4) : '',
    evolutionInstance: evolutionInstance || '',
    groupId:           groupId           || '',
    channelId:         channelId         || '',
    evolutionMethod:   method            || 'baileys',
    enabled:           getWhatsAppEnabled(sqlite),
  });
});

// POST /api/whatsapp/config
router.post('/config', auth, (req, res) => {
  const { evolutionUrl, evolutionApiKey, evolutionInstance, groupId, channelId, enabled, evolutionMethod } = req.body;
  const hasUrl      = evolutionUrl      != null && String(evolutionUrl).trim()      !== '';
  const hasApiKey   = evolutionApiKey   != null && String(evolutionApiKey).trim()   !== '';
  const hasInstance = evolutionInstance != null && String(evolutionInstance).trim() !== '';

  if (hasApiKey && !/^[\x00-\x7F]+$/.test(String(evolutionApiKey))) {
    return res.status(400).json({ ok: false, error: 'API key contains invalid characters — enter the full key, not the masked preview.' });
  }
  if (evolutionMethod != null && !['baileys', 'cloud_api'].includes(evolutionMethod)) {
    return res.status(400).json({ ok: false, error: 'evolutionMethod must be baileys or cloud_api' });
  }
  const hasGroupId  = groupId           != null && String(groupId).trim()           !== '';
  const hasChannel  = channelId         != null && String(channelId).trim()         !== '';
  const hasEnabled  = enabled           != null;
  const hasMethod   = evolutionMethod   != null;

  if (!hasUrl && !hasApiKey && !hasInstance && !hasGroupId && !hasChannel && !hasEnabled && !hasMethod) {
    return res.status(400).json({ ok: false, error: 'Provide at least one field to update' });
  }

  try {
    const sqlite = getSQLite();
    const upsert = sqlite.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    if (hasUrl)      upsert.run('evolution_api_url',  String(evolutionUrl).trim());
    if (hasApiKey)   upsert.run('evolution_api_key',  String(evolutionApiKey).trim());
    if (hasInstance) upsert.run('evolution_instance', String(evolutionInstance).trim());
    if (hasGroupId)  upsert.run('whatsapp_group_id',  String(groupId).trim());
    if (hasChannel)  upsert.run('whatsapp_channel_id',String(channelId).trim());
    if (hasEnabled)  upsert.run('whatsapp_enabled',   enabled ? '1' : '0');
    if (hasMethod)   upsert.run('evolution_method',   evolutionMethod);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/whatsapp/health — live probe of the Evolution connection (no message sent)
router.get('/health', auth, async (req, res) => {
  try {
    res.json(await checkHealth());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/test
router.post('/test', auth, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'WhatsApp not configured — save your Evolution API URL, API Key, Instance Name and Group ID first.' });
  }
  const result = await sendMessage('✅ VermoSports Admin\n\nWhatsApp notifications are configured and working!', 'test');
  res.json(result);
});

// POST /api/whatsapp/test-channel — send a test message to the WhatsApp channel
router.post('/test-channel', auth, async (req, res) => {
  const { channelId } = getConfig();
  if (!channelId) {
    return res.status(400).json({ ok: false, error: 'WhatsApp channel not configured — save a Channel ID first.' });
  }
  const result = await sendToChannel('✅ VermoSports Admin\n\nWhatsApp channel notifications are configured and working!', 'test');
  res.json(result);
});

// POST /api/whatsapp/send-channel — manual message to the WhatsApp channel
router.post('/send-channel', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  const { channelId } = getConfig();
  if (!channelId) return res.status(400).json({ ok: false, error: 'WhatsApp channel not configured' });
  const result = await sendToChannel(text.trim(), 'manual');
  res.json(result);
});

// GET /api/whatsapp/logs
router.get('/logs', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const limit  = Math.min(200, parseInt(req.query.limit) || 100);
    const rows   = sqlite.prepare(
      "SELECT * FROM telegram_logs WHERE channel = 'whatsapp' ORDER BY id DESC LIMIT ?"
    ).all(limit);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/logs/:id/retry
router.post('/logs/:id/retry', auth, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'WhatsApp not configured' });
  }
  try {
    const sqlite = getSQLite();
    const row    = sqlite.prepare('SELECT * FROM telegram_logs WHERE id = ? AND channel = ?').get(Number(req.params.id), 'whatsapp');
    if (!row)         return res.status(404).json({ ok: false, error: 'Log entry not found' });
    if (!row.message) return res.status(400).json({ ok: false, error: 'No message stored for this entry (pre-dates retry feature)' });

    const result = await sendMessage(row.message, row.trigger);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/whatsapp/send — manual message from admin
router.post('/send', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  if (!isConfigured()) return res.status(400).json({ ok: false, error: 'WhatsApp not configured' });
  const result = await sendMessage(text.trim(), 'manual');
  res.json(result);
});

module.exports = router;
