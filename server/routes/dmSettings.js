const express = require('express');
const { getConfig, sendDM, sendDirectMessage, stripHtml, isConfigured } = require('../whatsapp');
const { getDb: getSQLite } = require('../sqlite');
const { getDb } = require('../db');
const { renderTemplate, hasUserDmSent, buildSettledBaseVars, getParticipantUserIds } = require('../gameBetWatcher');
const { ObjectId } = require('mongodb');
const auth = require('../middleware/auth');

const router = express.Router();

// Approved WhatsApp template preview (read-only — managed in WhatsApp Business Manager)
const APPROVED_WELCOME_PREVIEW = `Welcome to VermoSports, {{name}}! ⚽

You're officially part of the VermoSports community.

Stay updated with football competitions, rankings, match updates and important VermoSports announcements.

18+ only. Play responsibly.`;

function buildWelcomeText(name) {
  return APPROVED_WELCOME_PREVIEW.replace(/\{\{name\}\}/g, name || 'there');
}



router.get('/config', auth, (req, res) => {
  try {
    const db  = getSQLite();
    const get = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value ?? null;
    res.json({
      enabled:        get('whatsapp_dm_enabled') === '1',
      groupLink:      get('whatsapp_group_link')  || '',
      channelLink:    get('whatsapp_channel_link') || '',
      countryCode:    get('whatsapp_country_code') || '',
      welcomePreview: APPROVED_WELCOME_PREVIEW,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/config', auth, (req, res) => {
  try {
    const db  = getSQLite();
    const set = (k, v) => db.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(k, String(v));

    const { enabled, groupLink, channelLink, countryCode } = req.body;
    if (enabled != null)     set('whatsapp_dm_enabled',  enabled ? '1' : '0');
    if (groupLink != null)   set('whatsapp_group_link',  groupLink);
    if (channelLink != null) set('whatsapp_channel_link', channelLink);
    if (countryCode != null) set('whatsapp_country_code', countryCode);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Logs ───────────────────────────────────────────────────────────────────────

router.get('/logs', auth, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows  = getSQLite()
      .prepare('SELECT * FROM whatsapp_user_dms ORDER BY sent_at DESC LIMIT ?')
      .all(limit);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Welcome DM status for a specific user ────────────────────────────────────

router.get('/user-status/:userId', auth, (req, res) => {
  try {
    const row = getSQLite()
      .prepare("SELECT ok, error, sent_at FROM whatsapp_user_dms WHERE user_id = ? AND trigger = 'user_registered'")
      .get(req.params.userId);
    if (!row) return res.json({ sent: false, ok: false, error: null, sentAt: null });
    res.json({ sent: true, ok: row.ok === 1, error: row.error || null, sentAt: row.sent_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send welcome DM to a specific user ───────────────────────────────────────

router.post('/send-welcome/:userId', auth, async (req, res) => {
  const { userId } = req.params;
  try {
    const existing = getSQLite()
      .prepare("SELECT ok FROM whatsapp_user_dms WHERE user_id = ? AND trigger = 'user_registered'")
      .get(userId);
    if (existing?.ok === 1) {
      return res.status(409).json({ ok: false, reason: 'already_sent' });
    }

    const { ObjectId } = require('mongodb');
    const mongoDb = getDb();
    let userOid;
    try { userOid = new ObjectId(userId); } catch {
      return res.status(400).json({ ok: false, reason: 'invalid_user_id' });
    }
    const user = await mongoDb.collection('users').findOne(
      { _id: userOid },
      { projection: { mobile: 1, phone: 1, username: 1, name: 1, displayName: 1 } },
    );
    if (!user) return res.status(404).json({ ok: false, reason: 'user_not_found' });

    const phone = user.mobile || user.phone || null;
    if (!phone) return res.status(400).json({ ok: false, reason: 'no_phone' });

    const username = user.username || user.name || user.displayName || 'there';
    const result = await sendDM(userId, phone, username, buildWelcomeText(username), 'user_registered');
    res.json(result);
  } catch (err) {
    console.error('[dmSettings] send-welcome error:', err.message);
    res.status(500).json({ ok: false, reason: err.message });
  }
});

// ── Test ───────────────────────────────────────────────────────────────────────

router.post('/test', auth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  if (!isConfigured()) return res.json({ ok: false, reason: 'whatsapp_not_configured' });

  const result = await sendDM('__test__', phone, 'Test User', buildWelcomeText('Test User'), 'user_registered');
  res.json(result);
});

// ── Retry ──────────────────────────────────────────────────────────────────────

router.post('/logs/:id/retry', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const db  = getSQLite();
    const row = db.prepare('SELECT * FROM whatsapp_user_dms WHERE id = ?').get(Number(id));
    if (!row) return res.status(404).json({ error: 'log entry not found' });

    let result;
    if (!isConfigured()) return res.json({ ok: false, reason: 'whatsapp_not_configured' });
    if (row.trigger === 'user_registered') {
      let name = row.username || 'there';
      if (row.user_id && row.user_id !== '__test__') {
        try {
          const mongoDb = getDb();
          const user = await mongoDb.collection('users').findOne(
            { _id: new ObjectId(row.user_id) },
            { projection: { name: 1, username: 1, displayName: 1 } },
          );
          if (user) name = user.name || user.displayName || user.username || name;
        } catch { /* use cached name */ }
      }
      result = await sendDM(row.user_id, row.phone, name, buildWelcomeText(name), 'user_registered');
    } else {
      const db2 = getSQLite();
      const get = (k) => db2.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
      const rendered = renderTemplate(get('whatsapp_welcome_template') || '{{name}}', {
        name:         row.username || 'there',
        username:     row.username || '',
        group_link:   get('whatsapp_group_link')   || '(group link)',
        channel_link: get('whatsapp_channel_link') || '(channel link)',
      });
      result = await sendDM(row.user_id, row.phone, row.username, rendered, row.trigger);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

// ── Retry all failed DMs ──────────────────────────────────────────────────────

router.post('/retry-all-failed', auth, async (req, res) => {
  try {
    const sqlDb   = getSQLite();
    const mongoDb = getDb();

    const failed = sqlDb.prepare('SELECT * FROM whatsapp_user_dms WHERE ok = 0 LIMIT 50').all();
    if (failed.length === 0) return res.json({ ok: true, retried: 0, succeeded: 0, failed: 0 });

    let succeeded  = 0;
    let failedCount = 0;

    for (const row of failed) {
      let result;
      if (!isConfigured()) { failedCount++; continue; }
      if (row.trigger === 'user_registered') {
        let name = row.username || 'there';
        if (row.user_id && row.user_id !== '__test__') {
          try {
            const user = await mongoDb.collection('users').findOne(
              { _id: new ObjectId(row.user_id) },
              { projection: { name: 1, username: 1, displayName: 1 } },
            );
            if (user) name = user.name || user.displayName || user.username || name;
          } catch { /* use cached name */ }
        }
        result = await sendDM(row.user_id, row.phone, name, buildWelcomeText(name), 'user_registered');
      } else {
        const get = (k) => sqlDb.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
        const rendered = renderTemplate(get('whatsapp_welcome_template') || '{{name}}', {
          name:         row.username || 'there',
          username:     row.username || '',
          group_link:   get('whatsapp_group_link')   || '(group link)',
          channel_link: get('whatsapp_channel_link') || '(channel link)',
        });
        result = await sendDM(row.user_id, row.phone, row.username, rendered, row.trigger);
      }
      if (result.ok) succeeded++; else failedCount++;
    }

    res.json({ ok: true, retried: failed.length, succeeded, failed: failedCount });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Test settled DM by booking code ───────────────────────────────────────────

router.post('/test-settled', auth, async (req, res) => {
  const { bookingCode } = req.body;
  if (!bookingCode) return res.status(400).json({ error: 'bookingCode required' });

  if (!isConfigured()) return res.status(400).json({ error: 'WhatsApp not configured' });

  try {
    const mongoDb = getDb();
    const sqlDb   = getSQLite();
    const get     = (k) => sqlDb.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';

    const bet = await mongoDb.collection('game_bet').findOne({
      $or: [
        { bookingCode: bookingCode },
        { bookingCode: bookingCode.toUpperCase() },
        { title: bookingCode },
      ],
    });
    if (!bet) return res.status(404).json({ error: `No bet found with booking code "${bookingCode}"` });

    const settledTpl = sqlDb.prepare('SELECT template, enabled FROM telegram_templates WHERE trigger = ?').get('game_bet_settled');
    const { DEFAULT_TEMPLATES } = require('../gameBetWatcher');
    const tplText = (settledTpl && settledTpl.enabled) ? settledTpl.template : DEFAULT_TEMPLATES.game_bet_settled;

    const { baseVars, winnerId } = await buildSettledBaseVars(mongoDb, bet);
    const participantIds = getParticipantUserIds(bet);

    if (participantIds.length === 0) {
      return res.json({ ok: false, error: 'No participants found on this bet', results: [] });
    }

    const results = [];
    for (const userId of participantIds) {
      let user = null;
      try {
        user = await mongoDb.collection('users').findOne(
          { _id: new ObjectId(userId) },
          { projection: { mobile: 1, username: 1, displayName: 1, name: 1 } },
        );
      } catch { /* ignore */ }

      const username = user?.username || user?.displayName || user?.name || userId.slice(-6);
      const phone    = user?.mobile || null;

      if (!phone) {
        results.push({ username, phone: null, ok: false, reason: 'no_phone' });
        continue;
      }

      const vars   = { ...baseVars, recipient: username, your_result: userId === winnerId ? 'Won 🏆' : 'Lost' };
      const result = await sendDirectMessage(phone, renderTemplate(tplText, vars), 'game_bet_settled');
      results.push({ username, phone, ok: result.ok, reason: result.reason || null });
    }

    const allOk = results.every((r) => r.ok || r.reason === 'no_phone');
    res.json({ ok: allOk, betCode: baseVars.code, results });
  } catch (err) {
    console.error('[dmSettings] test-settled error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/stats', auth, (req, res) => {
  try {
    const db = getSQLite();
    const sentThisWeek   = db.prepare("SELECT COUNT(*) as c FROM whatsapp_user_dms WHERE ok = 1 AND sent_at >= datetime('now', '-7 days')").get()?.c || 0;
    const failedThisWeek = db.prepare("SELECT COUNT(*) as c FROM whatsapp_user_dms WHERE ok = 0 AND sent_at >= datetime('now', '-7 days')").get()?.c || 0;
    const total = sentThisWeek + failedThisWeek;
    const lastAutomated = db.prepare("SELECT sent_at FROM whatsapp_user_dms WHERE trigger = 'user_registered' AND ok = 1 ORDER BY id DESC LIMIT 1").get();
    const lastTest = db.prepare("SELECT sent_at, ok FROM whatsapp_user_dms WHERE user_id = '__test__' ORDER BY id DESC LIMIT 1").get();
    res.json({
      sentThisWeek,
      failedThisWeek,
      deliveryRate7d: total > 0 ? Math.round(sentThisWeek / total * 100) : null,
      lastAutomatedSend: lastAutomated?.sent_at || null,
      lastTestAt: lastTest?.sent_at || null,
      lastTestOk: lastTest ? lastTest.ok === 1 : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
