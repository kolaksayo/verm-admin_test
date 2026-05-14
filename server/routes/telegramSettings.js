const express = require('express');
const { sendMessage, isConfigured } = require('../telegram');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/telegram/status
router.get('/status', auth, (req, res) => {
  res.json({
    configured: isConfigured(),
    botTokenSet:  !!process.env.TELEGRAM_BOT_TOKEN,
    chatIdSet:    !!process.env.TELEGRAM_CHAT_ID,
  });
});

// POST /api/telegram/test
router.post('/test', auth, async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set in server .env' });
  }
  const result = await sendMessage(
    '✅ <b>VermoSports Admin</b>\n\nTelegram notifications are configured and working!',
  );
  res.json(result);
});

// POST /api/telegram/send  — manual message from admin
router.post('/send', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  if (!isConfigured()) return res.status(400).json({ ok: false, error: 'Telegram not configured' });
  const result = await sendMessage(text.trim());
  res.json(result);
});

module.exports = router;
