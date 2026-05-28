const express = require('express');
const { getConfig, sendDM, sendDirectMessage, stripHtml, DEFAULT_WELCOME_TEMPLATE } = require('../whatsapp');
const { getDb: getSQLite } = require('../sqlite');
const { getDb } = require('../db');
const { renderTemplate, hasUserDmSent, buildSettledBaseVars, getParticipantUserIds } = require('../gameBetWatcher');
const { ObjectId } = require('mongodb');
const auth = require('../middleware/auth');

const router = express.Router();

const DM_MACROS = [
  { key: '{{name}}',         desc: 'User display name' },
  { key: '{{username}}',     desc: 'Username' },
  { key: '{{group_link}}',   desc: 'WhatsApp group invite link' },
  { key: '{{channel_link}}', desc: 'WhatsApp channel link' },
];

// ── Config ─────────────────────────────────────────────────────────────────────

router.get('/config', auth, (req, res) => {
  try {
    const db  = getSQLite();
    const get = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value ?? null;
    res.json({
      enabled:         get('whatsapp_dm_enabled') === '1',
      welcomeTemplate: get('whatsapp_welcome_template') || DEFAULT_WELCOME_TEMPLATE,
      groupLink:       get('whatsapp_group_link')  || '',
      channelLink:     get('whatsapp_channel_link') || '',
      countryCode:     get('whatsapp_country_code') || '',
      macros:          DM_MACROS,
      defaultTemplate: DEFAULT_WELCOME_TEMPLATE,
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

    const { enabled, welcomeTemplate, groupLink, channelLink, countryCode } = req.body;
    if (enabled != null)         set('whatsapp_dm_enabled',       enabled ? '1' : '0');
    if (welcomeTemplate != null) set('whatsapp_welcome_template', welcomeTemplate);
    if (groupLink != null)       set('whatsapp_group_link',       groupLink);
    if (channelLink != null)     set('whatsapp_channel_link',     channelLink);
    if (countryCode != null)     set('whatsapp_country_code',     countryCode);

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

// ── Test ───────────────────────────────────────────────────────────────────────

router.post('/test', auth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  const { apiKey } = getConfig();
  if (!apiKey) return res.json({ ok: false, reason: 'whatsapp_not_configured' });

  try {
    const db  = getSQLite();
    const get = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';

    const template    = get('whatsapp_welcome_template') || DEFAULT_WELCOME_TEMPLATE;
    const groupLink   = get('whatsapp_group_link')  || '(group link)';
    const channelLink = get('whatsapp_channel_link') || '(channel link)';

    const rendered = renderTemplate(template, {
      name:         'Test User',
      username:     'testuser',
      group_link:   groupLink,
      channel_link: channelLink,
    });

    const result = await sendDM('__test__', phone, 'testuser', rendered, 'dm_test');
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

// ── Retry ──────────────────────────────────────────────────────────────────────

router.post('/logs/:id/retry', auth, async (req, res) => {
  const { id } = req.params;
  try {
    const db  = getSQLite();
    const row = db.prepare('SELECT * FROM whatsapp_user_dms WHERE id = ?').get(Number(id));
    if (!row) return res.status(404).json({ error: 'log entry not found' });

    const get = (k) => db.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
    const template    = get('whatsapp_welcome_template') || DEFAULT_WELCOME_TEMPLATE;
    const groupLink   = get('whatsapp_group_link')  || '(group link)';
    const channelLink = get('whatsapp_channel_link') || '(channel link)';

    let rendered;
    if (row.trigger === 'user_registered' && row.user_id !== '__test__') {
      // Re-look up user to get fresh name
      let name = row.username || 'there';
      try {
        const { ObjectId } = require('mongodb');
        const mongoDb = getDb();
        const user = await mongoDb.collection('users').findOne({ _id: new ObjectId(row.user_id) }, { projection: { name: 1, username: 1, displayName: 1 } });
        if (user) name = user.name || user.displayName || user.username || name;
      } catch { /* use cached name */ }

      rendered = renderTemplate(template, {
        name,
        username:     row.username || '',
        group_link:   groupLink,
        channel_link: channelLink,
      });
    } else {
      rendered = renderTemplate(template, {
        name:         row.username || 'there',
        username:     row.username || '',
        group_link:   groupLink,
        channel_link: channelLink,
      });
    }

    const result = await sendDM(row.user_id, row.phone, row.username, rendered, row.trigger);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, reason: err.message });
  }
});

// ── Retry all failed DMs ──────────────────────────────────────────────────────

router.post('/retry-all-failed', auth, async (req, res) => {
  try {
    const sqlDb  = getSQLite();
    const mongoDb = getDb();
    const get    = (k) => sqlDb.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';

    const failed = sqlDb.prepare('SELECT * FROM whatsapp_user_dms WHERE ok = 0 LIMIT 50').all();
    if (failed.length === 0) return res.json({ ok: true, retried: 0, succeeded: 0, failed: 0 });

    const template    = get('whatsapp_welcome_template') || DEFAULT_WELCOME_TEMPLATE;
    const groupLink   = get('whatsapp_group_link')  || '(group link)';
    const channelLink = get('whatsapp_channel_link') || '(channel link)';

    let succeeded = 0;
    let failedCount = 0;

    for (const row of failed) {
      let name = row.username || 'there';
      if (row.trigger === 'user_registered' && row.user_id && row.user_id !== '__test__') {
        try {
          const user = await mongoDb.collection('users').findOne(
            { _id: new ObjectId(row.user_id) },
            { projection: { name: 1, username: 1, displayName: 1 } },
          );
          if (user) name = user.name || user.displayName || user.username || name;
        } catch { /* use cached name */ }
      }

      const rendered = renderTemplate(template, {
        name,
        username:     row.username || '',
        group_link:   groupLink,
        channel_link: channelLink,
      });

      const result = await sendDM(row.user_id, row.phone, row.username, rendered, row.trigger);
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

  const { apiKey } = getConfig();
  if (!apiKey) return res.status(400).json({ error: 'WhatsApp not configured' });

  try {
    const mongoDb = getDb();
    const sqlDb   = getSQLite();
    const get     = (k) => sqlDb.prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';

    // Find bet by booking code (case-insensitive)
    const bet = await mongoDb.collection('game_bet').findOne({
      $or: [
        { bookingCode: bookingCode },
        { bookingCode: bookingCode.toUpperCase() },
        { title: bookingCode },
      ],
    });
    if (!bet) return res.status(404).json({ error: `No bet found with booking code "${bookingCode}"` });

    const template = get('whatsapp_welcome_template') || null;

    // Use the settled template (stored or default)
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

      const username  = user?.username || user?.displayName || user?.name || userId.slice(-6);
      const phone     = user?.mobile || null;

      if (!phone) {
        results.push({ username, phone: null, ok: false, reason: 'no_phone' });
        continue;
      }

      const recipient = username;
      const vars = { ...baseVars, recipient, your_result: userId === winnerId ? 'Won 🏆' : 'Lost' };
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

module.exports = router;
