const express = require('express');
const { sendMessage: sendTelegram } = require('../telegram');
const { sendMessage: sendToGroup, sendToChannel } = require('../whatsapp');
const auth = require('../middleware/auth');

const router = express.Router();

// ── Send ───────────────────────────────────────────────────────────────────────

router.post('/send', auth, async (req, res) => {
  const { content, channels = [] } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  const results = {};

  if (channels.includes('telegram')) {
    results.telegram = await sendTelegram(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }
  if (channels.includes('whatsapp_group')) {
    results.whatsapp_group = await sendToGroup(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }
  if (channels.includes('whatsapp_channel')) {
    results.whatsapp_channel = await sendToChannel(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }

  const anyOk = Object.values(results).some((r) => r.ok);
  res.json({ ok: anyOk, results });
});

module.exports = router;
