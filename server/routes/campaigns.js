const express = require('express');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const {
  sendMessage: sendTelegram, sendPhoto: sendTelegramPhoto,
  sendToChannel: sendTelegramChannel, sendPhotoToChannel: sendTelegramChannelPhoto,
} = require('../telegram');
const {
  sendMessage: sendToGroup, sendToChannel, sendMediaMessage, sendMediaToChannel,
  sendDM, sendMediaDM,
} = require('../whatsapp');
const {
  isConfigured: isTelegramConfigured, isChannelConfigured: isTelegramChannelConfigured,
} = require('../telegram');
const { getConfig: getWaConfig, isConfigured: isWaConfigured } = require('../whatsapp');
const { getDb: getSQLite } = require('../sqlite');
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

// GET /api/campaigns/channels — which broadcast targets are usable right now.
// Lives here rather than reusing /telegram/status so it is reachable with the
// campaigns permission alone.
//
// `configured` is what decides whether a campaign can be sent. The *_enabled
// flags only govern automatic mirroring of notifications — the send helpers
// never consult them — so they are reported for context but do not block a
// manual broadcast.
router.get('/channels', auth, requirePermission('system', 'campaigns'), (req, res) => {
  const flag = (key) => {
    try {
      const row = getSQLite().prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
      return row ? row.value !== '0' : true;   // absent means on
    } catch {
      return true;
    }
  };

  let wa = { groupId: '', channelId: '' };
  try { wa = getWaConfig(); } catch { /* leave blank */ }
  const waReady = (() => { try { return isWaConfigured(); } catch { return false; } })();

  res.json({
    telegram:         { configured: isTelegramConfigured(),        enabled: flag('telegram_enabled') },
    telegram_channel: { configured: isTelegramChannelConfigured(), enabled: flag('telegram_channel_enabled') },
    whatsapp_group:   { configured: waReady && !!wa.groupId,       enabled: flag('whatsapp_enabled') },
    whatsapp_channel: { configured: waReady && !!wa.channelId,     enabled: flag('whatsapp_channel_enabled') },
  });
});

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
    const tgTargets = ['telegram', 'telegram_channel'].filter((c) => channels.includes(c));
    if (tgTargets.length && content.length > TELEGRAM_CAPTION_LIMIT) {
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
  if (channels.includes('telegram_channel')) {
    results.telegram_channel = media
      ? await sendTelegramChannelPhoto(media.buffer, media.mimetype, media.filename, content, 'campaign').catch((e) => ({ ok: false, reason: e.message }))
      : await sendTelegramChannel(content, 'campaign').catch((e) => ({ ok: false, reason: e.message }));
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

// ── WhatsApp Direct Messages ─────────────────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DM_THROTTLE_MS = 400; // small gap between sends to respect provider rate limits

// Recipient picker source: lean list of users who have a phone on file, matched
// by username/email/mobile. Purpose-built for the DM tab (not the generic
// collections list, so it doesn't depend on the separate `users` permission).
router.get('/recipients', auth, requirePermission('system', 'campaigns'), async (req, res) => {
  const search = (req.query.search || '').trim();
  if (search.length < 2) return res.json([]);
  try {
    const db = getDb();
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = { $regex: safe, $options: 'i' };
    const users = await db.collection('users')
      .find(
        {
          mobile: { $exists: true, $nin: [null, ''] },
          $or: [{ username: rx }, { email: rx }, { mobile: rx }],
        },
        { projection: { username: 1, email: 1, mobile: 1 }, limit: 30 },
      )
      .toArray();
    res.json(users.map((u) => ({
      id: u._id.toString(),
      username: u.username || null,
      email: u.email || null,
      mobile: u.mobile || null,
    })));
  } catch (err) {
    console.error('Campaign recipients search error:', err);
    res.status(500).json({ error: 'Failed to search recipients' });
  }
});

// Send a WhatsApp DM to each selected user, sequentially with a small throttle.
// The message text is the caption when an image is attached (same convention as
// /send). Uses the DM-scope WhatsApp config.
router.post('/send-dm', auth, requireEditMode, requirePermission('system', 'campaigns'), uploadImage, async (req, res) => {
  const { content } = req.body;
  const userIds = normalizeChannels(req.body.userIds ?? []); // reuse array/JSON-string normalizer
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  if (!userIds.length) return res.status(400).json({ error: 'at least one recipient required' });

  let media = null;
  if (req.file) {
    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed' });
    }
    media = {
      buffer:   req.file.buffer,
      base64:   req.file.buffer.toString('base64'),
      mimetype: req.file.mimetype,
      filename: req.file.originalname || 'image',
      caption:  content,
    };
  }

  let db;
  try { db = getDb(); } catch { return res.status(500).json({ error: 'Database unavailable' }); }

  // Resolve recipients up front, preserving order and skipping bad/duplicate ids.
  const seen = new Set();
  const recipients = [];
  for (const raw of userIds) {
    const id = String(raw);
    if (seen.has(id)) continue;
    seen.add(id);
    let user = null;
    try {
      user = await db.collection('users').findOne(
        { _id: new ObjectId(id) },
        { projection: { mobile: 1, username: 1 } },
      );
    } catch { /* invalid ObjectId */ }
    recipients.push({ id, username: user?.username || null, mobile: user?.mobile || null, found: !!user });
  }

  const results = [];
  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    if (!r.found || !r.mobile) {
      results.push({ id: r.id, username: r.username, ok: false, reason: r.found ? 'no_phone' : 'not_found' });
      continue;
    }
    const out = media
      ? await sendMediaDM(r.id, r.mobile, r.username, media, 'campaign_dm').catch((e) => ({ ok: false, reason: e.message }))
      : await sendDM(r.id, r.mobile, r.username, content, 'campaign_dm').catch((e) => ({ ok: false, reason: e.message }));
    results.push({ id: r.id, username: r.username, ok: !!out.ok, reason: out.reason || null });
    if (i < recipients.length - 1) await delay(DM_THROTTLE_MS);
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  res.json({ ok: sent > 0, sent, failed, results });
});

module.exports = router;
