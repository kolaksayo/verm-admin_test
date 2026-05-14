const express = require('express');
const { sendMessage, isConfigured, getConfig } = require('../telegram');
const { DEFAULT_TEMPLATE, GAME_BET_MACROS } = require('../gameBetWatcher');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');

const TRIGGERS = [
  {
    trigger:     'game_bet',
    label:       'New Challenge (Game Bet)',
    description: 'Fired when a new game_bet challenge is created',
    macros:      GAME_BET_MACROS,
    default:     DEFAULT_TEMPLATE,
  },
];

const router = express.Router();

// GET /api/telegram/status
router.get('/status', auth, (req, res) => {
  const { token, chatId } = getConfig();
  res.json({
    configured:  !!(token && chatId),
    botTokenSet: !!token,
    chatIdSet:   !!chatId,
    botTokenPreview: token ? token.slice(0, 8) + '…' : null,
    chatId: chatId || null,
  });
});

// GET /api/telegram/config — returns current saved values (token masked)
router.get('/config', auth, (req, res) => {
  const { token, chatId } = getConfig();
  res.json({
    botToken: token ? token.slice(0, 8) + '…' + token.slice(-4) : '',
    chatId:   chatId || '',
  });
});

// POST /api/telegram/config — save bot token and chat ID to SQLite
router.post('/config', auth, (req, res) => {
  const { botToken, chatId } = req.body;
  if (!botToken?.trim() || !chatId?.trim()) {
    return res.status(400).json({ ok: false, error: 'botToken and chatId are required' });
  }
  try {
    const sqlite = getSQLite();
    const upsert = sqlite.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    upsert.run('telegram_bot_token', botToken.trim());
    upsert.run('telegram_chat_id',   chatId.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/test
router.post('/test', auth, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram not configured — save your Bot Token and Chat ID first.' });
  }
  const result = await sendMessage('✅ <b>VermoSports Admin</b>\n\nTelegram notifications are configured and working!');
  res.json(result);
});

// GET /api/telegram/logs — recent send log from SQLite
router.get('/logs', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const limit  = Math.min(200, parseInt(req.query.limit) || 100);
    const rows   = sqlite.prepare(
      'SELECT * FROM telegram_logs ORDER BY id DESC LIMIT ?'
    ).all(limit);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telegram/templates — list all trigger templates
router.get('/templates', auth, (req, res) => {
  try {
    const sqlite = getSQLite();
    const rows   = sqlite.prepare('SELECT * FROM telegram_templates').all();
    const byKey  = {};
    rows.forEach((r) => { byKey[r.trigger] = r; });

    const result = TRIGGERS.map((t) => ({
      trigger:     t.trigger,
      label:       t.label,
      description: t.description,
      macros:      t.macros,
      template:    byKey[t.trigger]?.template ?? t.default,
      enabled:     byKey[t.trigger] ? !!byKey[t.trigger].enabled : true,
      updated_at:  byKey[t.trigger]?.updated_at || null,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/telegram/templates/:trigger — save template
router.post('/templates/:trigger', auth, (req, res) => {
  const valid = TRIGGERS.find((t) => t.trigger === req.params.trigger);
  if (!valid) return res.status(404).json({ ok: false, error: 'Unknown trigger' });

  const { template, enabled } = req.body;
  if (template === undefined) return res.status(400).json({ ok: false, error: 'template is required' });

  try {
    getSQLite().prepare(`
      INSERT INTO telegram_templates (trigger, template, enabled, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(trigger) DO UPDATE SET
        template   = excluded.template,
        enabled    = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(req.params.trigger, template, enabled === false ? 0 : 1);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/send — manual message from admin
router.post('/send', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  if (!isConfigured()) return res.status(400).json({ ok: false, error: 'Telegram not configured' });
  const result = await sendMessage(text.trim());
  res.json(result);
});

module.exports = router;
