const express = require('express');
const { sendMessage, isConfigured, getConfig } = require('../telegram');
const { getDb: getSQLite } = require('../sqlite');
const auth = require('../middleware/auth');

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

// POST /api/telegram/send — manual message from admin
router.post('/send', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  if (!isConfigured()) return res.status(400).json({ ok: false, error: 'Telegram not configured' });
  const result = await sendMessage(text.trim());
  res.json(result);
});

module.exports = router;
