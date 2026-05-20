const express = require('express');
const { sendMessage, isConfigured, getConfig } = require('../whatsapp');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/whatsapp/status
router.get('/status', auth, (req, res) => {
  const { token, groupId } = getConfig();
  res.json({
    configured:       !!(token && groupId),
    tokenSet:         !!token,
    groupIdSet:       !!groupId,
    tokenPreview:     token ? token.slice(0, 8) + '…' : null,
    groupId:          groupId || null,
  });
});

// GET /api/whatsapp/config
router.get('/config', auth, (req, res) => {
  const { token, groupId } = getConfig();
  res.json({
    apiToken: token ? token.slice(0, 8) + '…' + token.slice(-4) : '',
    groupId:  groupId || '',
  });
});

// POST /api/whatsapp/config
router.post('/config', auth, (req, res) => {
  const { apiToken, groupId } = req.body;
  const hasToken   = apiToken != null && String(apiToken).trim() !== '';
  const hasGroupId = groupId  != null && String(groupId).trim()  !== '';

  if (!hasToken && !hasGroupId) {
    return res.status(400).json({ ok: false, error: 'Provide at least one of: apiToken, groupId' });
  }

  try {
    const sqlite = getSQLite();
    const upsert = sqlite.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    if (hasToken)   upsert.run('whatsapp_api_token', String(apiToken).trim());
    if (hasGroupId) upsert.run('whatsapp_group_id',  String(groupId).trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/whatsapp/test
router.post('/test', auth, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'WhatsApp not configured — save your API Token and Group ID first.' });
  }
  const result = await sendMessage('✅ VermoSports Admin\n\nWhatsApp notifications are configured and working!', 'test');
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

module.exports = router;
