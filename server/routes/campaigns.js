const express = require('express');
const multer = require('multer');
const { sendMessage: sendTelegram, sendPhoto: sendTelegramPhoto } = require('../telegram');
const { sendMessage: sendToGroup, sendToChannel, sendMediaMessage, sendMediaToChannel } = require('../whatsapp');
const auth = require('../middleware/auth');
const { requireEditMode } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

// ── Optional single-image upload (in-memory only — campaigns are at most 3
// broadcasts, so the image is held for the request and sent inline; no storage).
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TELEGRAM_CAPTION_LIMIT = 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
  },
});

// Multer only parses multipart/form-data — plain JSON requests pass straight
// through untouched, so the text-only path is byte-for-byte what it was.
const uploadImage = (req, res, next) =>
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? 'Image too large — max 5MB' : (err.message || 'Invalid upload'),
      });
    }
    next();
  });

// channels arrives as a real array (JSON body), a JSON-stringified array
// (multipart field), or a repeated multipart field (array of strings).
function normalizeChannels(raw) {
  if (Array.isArray(raw)) return raw.flatMap((v) => normalizeChannels(v));
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s.startsWith('[')) {
      try { const parsed = JSON.parse(s); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return s ? [s] : [];
  }
  return [];
}

// ── Send ───────────────────────────────────────────────────────────────────────

router.post('/send', auth, requireEditMode, requirePermission('system', 'campaigns'), uploadImage, async (req, res) => {
  const { content } = req.body;
  const channels = normalizeChannels(req.body.channels ?? []);
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });

  let media = null;
  if (req.file) {
    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed' });
    }
    if (channels.includes('telegram') && content.length > TELEGRAM_CAPTION_LIMIT) {
      return res.status(400).json({
        error: `Telegram photo captions are limited to ${TELEGRAM_CAPTION_LIMIT} characters (message is ${content.length}). Shorten the message or unselect Telegram.`,
      });
    }
    media = {
      buffer:   req.file.buffer,
      base64:   req.file.buffer.toString('base64'),
      mimetype: req.file.mimetype,
      filename: req.file.originalname || 'image',
      caption:  content,
    };
  }

  const results = {};

  if (channels.includes('telegram')) {
    results.telegram = media
      ? await sendTelegramPhoto(media.buffer, media.mimetype, media.filename, content, 'campaign').catch((e) => ({ ok: false, reason: e.message }))
      : await sendTelegram(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }
  if (channels.includes('whatsapp_group')) {
    results.whatsapp_group = media
      ? await sendMediaMessage(media, 'campaign').catch((e) => ({ ok: false, reason: e.message }))
      : await sendToGroup(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }
  if (channels.includes('whatsapp_channel')) {
    results.whatsapp_channel = media
      ? await sendMediaToChannel(media, 'campaign').catch((e) => ({ ok: false, reason: e.message }))
      : await sendToChannel(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
  }

  const anyOk = Object.values(results).some((r) => r.ok);
  res.json({ ok: anyOk, results });
});

module.exports = router;
