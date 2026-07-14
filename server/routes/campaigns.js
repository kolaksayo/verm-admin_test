const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { getDb: getSQLite } = require('../sqlite');
const { sendMessage: sendTelegram, sendPhoto: sendTelegramPhoto } = require('../telegram');
const {
  sendMessage: sendToGroup, sendToChannel, sendMediaMessage, sendMediaToChannel,
  sendDM, sendMediaDM,
} = require('../whatsapp');
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

// ── Transient hosted media (for WhatsApp DMs) ────────────────────────────────────
// Some Evolution instances reject inline base64 and require a fetchable URL, so
// for DMs we stash the image in memory under a random token and expose it at a
// public URL the provider can pull. Short-lived, no disk/DB (matches the
// in-memory campaign philosophy). Assumes a single server instance.
const MEDIA_TTL_MS = 30 * 60 * 1000; // 30 min
const mediaStore = new Map(); // token -> { buffer, mimetype, expiresAt }

function sweepMedia() {
  const now = Date.now();
  for (const [token, m] of mediaStore) {
    if (m.expiresAt <= now) mediaStore.delete(token);
  }
}

function stashMedia(buffer, mimetype) {
  sweepMedia();
  const token = crypto.randomBytes(24).toString('hex');
  mediaStore.set(token, { buffer, mimetype, expiresAt: Date.now() + MEDIA_TTL_MS });
  return token;
}

// Public base URL for provider-fetchable media links. Explicit config wins so a
// reverse proxy can't mislead the auto-derivation: env → admin setting →
// forwarded host/proto → request host.
function configuredBaseUrl() {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  try {
    const v = getSQLite().prepare('SELECT value FROM admin_settings WHERE key = ?').get('dm_public_base_url')?.value;
    if (v && v.trim()) return v.trim().replace(/\/+$/, '');
  } catch { /* ignore */ }
  return null;
}

function publicBaseUrl(req) {
  const configured = configuredBaseUrl();
  if (configured) return configured;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

// A tiny 1x1 transparent PNG for the reachability test route.
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

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
  let mediaToken = null;
  if (req.file) {
    if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed' });
    }
    // Host the image at a public URL and send that (Evolution DM instances may
    // reject inline base64). base64 stays as a fallback for providers that want it.
    mediaToken = stashMedia(req.file.buffer, req.file.mimetype);
    media = {
      buffer:   req.file.buffer,
      base64:   req.file.buffer.toString('base64'),
      url:      `${publicBaseUrl(req)}/api/campaigns/media/${mediaToken}`,
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

  // Intentionally do NOT delete the token here: some providers fetch the URL
  // slightly after their send call returns, so we let the TTL sweep expire it
  // rather than risk pulling the image out from under a late fetch.
  void mediaToken;

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  res.json({ ok: sent > 0, sent, failed, results });
});

// Public reachability probe: if this image loads in a browser (or Evolution),
// the configured public base URL can serve DM images. Stateless, no token.
router.get('/media-test', (req, res) => {
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store');
  res.send(TEST_PNG);
});

// Public, unauthenticated so the WhatsApp provider can fetch DM images by token.
// Random token + short TTL; nothing sensitive is exposed beyond the campaign image.
router.get('/media/:token', (req, res) => {
  sweepMedia();
  const m = mediaStore.get(req.params.token);
  if (!m || m.expiresAt <= Date.now()) return res.status(404).send('Not found');
  res.set('Content-Type', m.mimetype);
  res.set('Cache-Control', 'no-store');
  res.send(m.buffer);
});

module.exports = router;
