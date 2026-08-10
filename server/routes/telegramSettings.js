const express = require('express');
const { ObjectId } = require('mongodb');
const { sendMessage, sendToChannel, isConfigured, isChannelConfigured, getConfig, checkHealth, normalizeChatId } = require('../telegram');
const { sendMessage: sendWhatsApp, isConfigured: isWAConfigured } = require('../whatsapp');
const {
  DEFAULT_TEMPLATES,
  GAME_BET_MACROS,
  MULTI_BASE_MACROS,
  COUNTDOWN_MACROS,
  LARGE_STAKE_MACROS,
  SINGLE_COUNTDOWN_MACROS,
  GROUPED_COUNTDOWN_MACROS,
  SETTLED_MACROS,
  RANKINGS_MACROS,
  renderTemplate,
  getTemplate,
  getWatcherState,
  buildRankingsVars,
  getRankingsTopN,
  resolveFixture,
  resolveAllFixtures,
  resolveCreator,
  buildMultiVars,
  formatMode,
  isMultiplayer,
  getCurrentPlayers,
  notifyAll,
} = require('../gameBetWatcher');
const { getDb: getSQLite } = require('../sqlite');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const TRIGGERS = [
  // ── Single bet mode ──────────────────────────────────────────────────────────
  {
    trigger:     'game_bet',
    group:       'single',
    label:       'New Challenge — Single',
    description: 'Fired when a new single-mode challenge is created',
    macros:      GAME_BET_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet,
  },
  // ── Multiplayer bet mode ─────────────────────────────────────────────────────
  {
    trigger:     'game_bet_multi_created',
    group:       'multi',
    label:       'New Challenge — Multiplayer',
    description: 'Fired when a new multiplayer challenge is created',
    macros:      MULTI_BASE_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_multi_created,
  },
  {
    trigger:     'game_bet_multi_half',
    group:       'multi',
    label:       'Challenge 60% Full',
    description: 'Fired once when a multiplayer challenge reaches 60% capacity',
    macros:      MULTI_BASE_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_multi_half,
  },
  {
    trigger:     'game_bet_multi_almost_3',
    group:       'multi',
    label:       'Challenge — 3 Slots Remaining',
    description: 'Fired once when only 3 slots remain in a multiplayer challenge',
    macros:      MULTI_BASE_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_multi_almost_3,
  },
  {
    trigger:     'game_bet_multi_almost_1',
    group:       'multi',
    label:       'Challenge — Last Slot',
    description: 'Fired once when only the last slot remains in a multiplayer challenge',
    macros:      MULTI_BASE_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_multi_almost_1,
  },
  {
    trigger:     'game_bet_large_stake',
    group:       'multi',
    label:       'Large Stake Alert',
    description: 'Fired when a multiplayer bet stake exceeds the configured threshold',
    macros:      LARGE_STAKE_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_large_stake,
  },
  // ── Settled (all modes) ───────────────────────────────────────────────────────
  {
    trigger:     'game_bet_settled',
    group:       'settled',
    label:       'Challenge Settled',
    description: 'Fired once when a challenge is resolved and a winner is determined',
    macros:      SETTLED_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_settled,
  },
  // ── Countdown (single + multiplayer, grouped by time window) ─────────────────
  {
    trigger:     'game_bet_countdown_1hr',
    group:       'countdown',
    label:       'Countdown — 1 Hour',
    description: 'Sent 1 hour before kickoff; groups all active single + multiplayer bets in one message',
    macros:      GROUPED_COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_countdown_1hr,
  },
  {
    trigger:     'game_bet_countdown_30min',
    group:       'countdown',
    label:       'Countdown — 30 Minutes',
    description: 'Sent 30 minutes before kickoff; groups all active single + multiplayer bets in one message',
    macros:      GROUPED_COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_countdown_30min,
  },
  {
    trigger:     'game_bet_countdown_15min',
    group:       'countdown',
    label:       'Countdown — 15 Minutes',
    description: 'Sent 15 minutes before kickoff; groups all active single + multiplayer bets in one message',
    macros:      GROUPED_COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_countdown_15min,
  },
  // ── Rankings ──────────────────────────────────────────────────────────────────
  {
    trigger:     'rankings_weekly',
    group:       'rankings',
    label:       'Weekly Rankings',
    description: 'Sent every Monday with the top 10 players for the past week',
    macros:      RANKINGS_MACROS,
    default:     DEFAULT_TEMPLATES.rankings_weekly,
  },
  {
    trigger:     'rankings_monthly',
    group:       'rankings',
    label:       'Monthly Rankings',
    description: 'Sent on the 1st of each month with the top 10 players for the past month',
    macros:      RANKINGS_MACROS,
    default:     DEFAULT_TEMPLATES.rankings_monthly,
  },
];

const router = express.Router();

// ── Inline team-name resolver for test endpoint ────────────────────────────────
async function resolveTeamNameLocal(db, val) {
  if (!val) return null;
  if (val && typeof val === 'object' && !(val instanceof ObjectId))
    return val.name || val.teamName || null;
  try {
    const oid = new ObjectId(String(val));
    const t   = await db.collection('football_teams').findOne({ _id: oid }, { projection: { name: 1 } });
    return t?.name || null;
  } catch {
    return null;
  }
}

// GET /api/telegram/status
router.get('/status', auth, requirePermission('system', 'notifications'), (req, res) => {
  const { token, chatId, channelId } = getConfig();
  const sqlite = getSQLite();
  const row = sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_enabled'").get();
  const enabled = row ? row.value !== '0' : true;
  const chRow = sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_channel_enabled'").get();
  res.json({
    configured:      !!(token && chatId),
    botTokenSet:     !!token,
    chatIdSet:       !!chatId,
    botTokenPreview: token ? token.slice(0, 8) + '…' : null,
    chatId:          chatId || null,
    enabled,
    channelId:            channelId || null,
    channelIdSet:         !!channelId,
    channelConfigured:    !!(token && channelId),
    channelEnabled:       chRow ? chRow.value !== '0' : true,
  });
});

// GET /api/telegram/health — live probe of bot token + chat (no message sent)
router.get('/health', auth, requirePermission('system', 'notifications'), async (req, res) => {
  try {
    res.json(await checkHealth());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telegram/config — returns current saved values (token masked)
router.get('/config', auth, requirePermission('system', 'notifications'), (req, res) => {
  const { token, chatId, channelId } = getConfig();
  const sqlite = getSQLite();
  const threshold = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = 'large_stake_threshold'")
    .get();
  const topN = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = 'rankings_top_n'")
    .get();
  const betCard = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = 'bet_card_image_enabled'")
    .get();
  const chEnabled = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = 'telegram_channel_enabled'")
    .get();
  res.json({
    botToken:           token ? token.slice(0, 8) + '…' + token.slice(-4) : '',
    chatId:             chatId || '',
    channelId:          channelId || '',
    channelEnabled:     chEnabled ? chEnabled.value !== '0' : true,
    largeStakeThreshold: threshold ? Number(threshold.value) : 7,
    rankingsTopN:        topN ? Number(topN.value) : 10,
    // Absent key means enabled — matches wagerCard.js's default.
    betCardImageEnabled: betCard ? betCard.value !== '0' : true,
  });
});

// POST /api/telegram/config — save bot token, chat ID, and/or threshold
router.post('/config', auth, requirePermission('system', 'notifications'), (req, res) => {
  const { botToken, chatId, channelId, channelEnabled, largeStakeThreshold, rankingsTopN, enabled, betCardImageEnabled } = req.body;

  const hasToken     = botToken != null && String(botToken).trim() !== '';
  const hasChatId    = chatId   != null && String(chatId).trim()   !== '';
  const hasChannelId = channelId != null;              // '' clears it (stops mirroring)
  const hasChannelEn = channelEnabled != null;
  const hasThreshold = largeStakeThreshold != null && Number(largeStakeThreshold) > 0;
  const hasTopN      = rankingsTopN != null && Number.isInteger(Number(rankingsTopN)) && Number(rankingsTopN) >= 1;
  const hasEnabled   = enabled != null;
  const hasBetCard   = betCardImageEnabled != null;

  if (!hasToken && !hasChatId && !hasChannelId && !hasChannelEn && !hasThreshold && !hasTopN && !hasEnabled && !hasBetCard) {
    return res.status(400).json({ ok: false, error: 'Provide at least one field to update' });
  }

  try {
    const sqlite = getSQLite();
    const upsert = sqlite.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    if (hasToken)     upsert.run('telegram_bot_token', String(botToken).trim());
    if (hasChatId)    upsert.run('telegram_chat_id',   String(chatId).trim());
    if (hasChannelId) upsert.run('telegram_channel_id', normalizeChatId(channelId));
    if (hasChannelEn) upsert.run('telegram_channel_enabled', channelEnabled ? '1' : '0');
    if (hasThreshold) upsert.run('large_stake_threshold', String(Number(largeStakeThreshold)));
    if (hasTopN)      upsert.run('rankings_top_n', String(Math.min(25, Math.max(1, Number(rankingsTopN)))));
    if (hasEnabled)   upsert.run('telegram_enabled', enabled ? '1' : '0');
    if (hasBetCard)   upsert.run('bet_card_image_enabled', betCardImageEnabled ? '1' : '0');

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/test
router.post('/test', auth, requirePermission('system', 'notifications'), async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram not configured — save your Bot Token and Chat ID first.' });
  }
  const tgRow = getSQLite().prepare("SELECT value FROM admin_settings WHERE key = 'telegram_enabled'").get();
  if (tgRow && tgRow.value === '0') {
    return res.status(400).json({ ok: false, error: 'Telegram notifications are disabled. Enable them first.' });
  }
  const result = await sendMessage('✅ <b>VermoSports Admin</b>\n\nTelegram notifications are configured and working!');
  res.json(result);
});

// Telegram's errors are terse; add the fix for the ones that actually come up.
function explainTelegramError(reason) {
  const r = String(reason || '');
  if (/chat not found/i.test(r)) {
    return `${r} — for a private channel use the -100… numeric ID (not the invite link), and add the bot to the channel as an administrator. A public channel can use @name.`;
  }
  if (/not enough rights|CHAT_ADMIN_REQUIRED|not a member/i.test(r)) {
    return `${r} — make the bot an administrator of the channel with "Post Messages" permission.`;
  }
  return r;
}

// POST /api/telegram/test-channel — send a test message to the Telegram channel
router.post('/test-channel', auth, requirePermission('system', 'notifications'), async (req, res) => {
  if (!isChannelConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram channel not configured — save a Channel ID first.' });
  }
  const row = getSQLite().prepare("SELECT value FROM admin_settings WHERE key = 'telegram_channel_enabled'").get();
  if (row && row.value === '0') {
    return res.status(400).json({ ok: false, error: 'Telegram channel mirroring is disabled. Enable it first.' });
  }
  const result = await sendToChannel('✅ <b>VermoSports Admin</b>\n\nTelegram channel notifications are configured and working!', 'test');
  if (result?.ok === false || result?.ok === undefined && result?.description) {
    // Surface Telegram's own reason — most often the bot isn't a channel admin.
    const reason = result.description || result.reason || 'Send failed';
    return res.json({ ok: false, error: explainTelegramError(reason) });
  }
  res.json(result);
});

// GET /api/telegram/logs — recent send log from SQLite
// ?channel=telegram|whatsapp|all  (default: telegram)
router.get('/logs', auth, requirePermission('system', 'notifications'), (req, res) => {
  try {
    const sqlite  = getSQLite();
    const limit   = Math.min(200, parseInt(req.query.limit) || 100);
    const channel = req.query.channel || 'telegram';
    const rows = channel === 'all'
      ? sqlite.prepare('SELECT * FROM telegram_logs ORDER BY id DESC LIMIT ?').all(limit)
      : sqlite.prepare("SELECT * FROM telegram_logs WHERE channel = ? ORDER BY id DESC LIMIT ?").all(channel, limit);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/telegram/templates — list all trigger templates
router.get('/templates', auth, requirePermission('system', 'notifications'), (req, res) => {
  try {
    const sqlite = getSQLite();
    const rows   = sqlite.prepare('SELECT * FROM telegram_templates').all();
    const byKey  = {};
    rows.forEach((r) => { byKey[r.trigger] = r; });

    const result = TRIGGERS.map((t) => ({
      trigger:     t.trigger,
      group:       t.group,
      label:       t.label,
      description: t.description,
      macros:      t.macros,
      template:    byKey[t.trigger]?.template ?? t.default,
      enabled:     byKey[t.trigger] ? !!byKey[t.trigger].enabled : true,
      updated_at:  byKey[t.trigger]?.updated_at || null,
      default:     t.default,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/telegram/templates/:trigger — save template
router.post('/templates/:trigger', auth, requirePermission('system', 'notifications'), (req, res) => {
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

// POST /api/telegram/templates/:trigger/test — send a test preview to all configured channels
router.post('/templates/:trigger/test', auth, requirePermission('system', 'notifications'), async (req, res) => {
  const valid = TRIGGERS.find((t) => t.trigger === req.params.trigger);
  if (!valid) return res.status(404).json({ ok: false, error: 'Unknown trigger' });

  const sqlite = getSQLite();
  const tgRow  = sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'telegram_enabled'").get();
  const tgEnabled = tgRow ? tgRow.value !== '0' : true;
  const waRow  = sqlite.prepare("SELECT value FROM admin_settings WHERE key = 'whatsapp_enabled'").get();
  const waEnabledFlag = waRow ? waRow.value !== '0' : true;

  if (!isConfigured() && !isWAConfigured()) {
    return res.status(400).json({ ok: false, error: 'No channels configured' });
  }

  try {
    const db = getDb();

    // Pick a random fixture for realistic test data
    let homeTeam = 'Home FC';
    let awayTeam = 'Away United';
    let league   = 'Premier League';
    let kickoffTime = '20:00';

    try {
      const fx = await db.collection('football_fixtures')
        .aggregate([{ $sample: { size: 1 } }])
        .next();

      if (fx) {
        const [ht, at] = await Promise.all([
          resolveTeamNameLocal(db, fx.homeTeam),
          resolveTeamNameLocal(db, fx.awayTeam),
        ]);
        if (ht) homeTeam = ht;
        if (at) awayTeam = at;

        // Resolve league
        const lgId = fx.leagueId || fx.league_id;
        if (lgId) {
          try {
            const lg = await db.collection('football_leagues').findOne(
              { _id: new ObjectId(String(lgId)) },
              { projection: { leagueName: 1, name: 1 } },
            );
            if (lg) league = lg.leagueName || lg.name || league;
          } catch {
            // ignore
          }
        }

        // Kickoff time
        const kickoffRaw = fx.firstPeriod || fx.date || fx.fixture?.date;
        if (kickoffRaw) {
          try {
            kickoffTime = new Date(kickoffRaw).toLocaleTimeString('en-GB', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
            });
          } catch {
            // keep default
          }
        }
      }
    } catch {
      // keep defaults if DB query fails
    }

    const sampleVars = {
      fixtures_list:       `• ${homeTeam} vs ${awayTeam}`,
      home_team:           homeTeam,
      away_team:           awayTeam,
      league,
      stake:               '$5.00',
      max_players:         10,
      current_players:     6,
      slots_remaining:     4,
      fill_percent:        '60%',
      current_pot:         '$30.00',
      potential_pot:       '$50.00',
      creator:             'testuser',
      winner:              'testuser',
      earnings:            '$21.00',
      players_joined:      6,
      code:                'TEST-ABCD',
      mode:                'Multiplayer',
      slots:               10,
      bet_type:            'SHOTSOFFGOAL',
      handicap:            '-1',
      minutes_until_match: 60,
      kickoff_time:        kickoffTime,
      match_date:          new Date().toLocaleDateString('en-GB'),
      // Rankings
      period:              'This Week',
      week:                '12 May – 18 May 2025',
      month:               'May 2025',
      generated_at:        new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      top_players:         '🥇 testuser1 — 320 pts (5 bets)\n🥈 testuser2 — 280 pts (4 bets)\n🥉 testuser3 — 210 pts (3 bets)\n4. testuser4 — 180 pts (6 bets)\n5. testuser5 — 150 pts (2 bets)',
      total_players:       42,
      count:               3,
      time_label:          '30 Minutes',
      bets_list:           `⚽ Single Bets:\n• ${homeTeam} vs ${awayTeam} — Code: TEST-ABCD\n• Arsenal vs Man City — Code: TEST-EFGH\n\n🎮 Multiplayer Bets:\n• Liverpool vs Tottenham — 2/4 players — Code: TEST-IJKL`,
      bets_list_full:      `⚽ Single Bets:\n• ${homeTeam} vs ${awayTeam} — Code: TEST-ABCD | Kickoff: 20:00\n• Arsenal vs Man City — Code: TEST-EFGH | Kickoff: 20:00\n\n🎮 Multiplayer Bets:\n• Liverpool vs Tottenham — 2/4 players — Code: TEST-IJKL | Kickoff: 20:30`,
    };

    // Get the saved (or default) template
    const template = getTemplate(req.params.trigger) || valid.default;
    const testMsg  = '[TEST] ' + renderTemplate(template, sampleVars);

    const triggerKey = req.params.trigger + '_test';
    const sends = [];
    if (isConfigured()   && tgEnabled)      sends.push(sendMessage(testMsg, triggerKey));
    if (isWAConfigured() && waEnabledFlag)  sends.push(sendWhatsApp(testMsg, triggerKey));

    if (sends.length === 0) {
      return res.json({ ok: false, reason: 'All configured channels have notifications disabled' });
    }

    const results = await Promise.allSettled(sends);
    const success = results.find(r => r.status === 'fulfilled' && r.value?.ok);
    const first   = results[0];
    res.json(
      success
        ? success.value
        : first.status === 'fulfilled' ? first.value : { ok: false, reason: first.reason?.message }
    );
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/telegram/watcher-status
router.get('/watcher-status', auth, requirePermission('system', 'notifications'), (req, res) => {
  res.json(getWatcherState());
});

// POST /api/telegram/watcher-settings — toggle individual polls on/off
router.post('/watcher-settings', auth, requirePermission('system', 'notifications'), (req, res) => {
  const { pollNewBetEnabled, pollProgressEnabled, pollUserDmEnabled } = req.body;
  try {
    const sqlite = getSQLite();
    const upsert = sqlite.prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    if (pollNewBetEnabled   != null) upsert.run('poll_newbet_enabled',   pollNewBetEnabled   ? '1' : '0');
    if (pollProgressEnabled != null) upsert.run('poll_progress_enabled', pollProgressEnabled ? '1' : '0');
    if (pollUserDmEnabled   != null) upsert.run('whatsapp_dm_enabled',   pollUserDmEnabled   ? '1' : '0');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/logs/:id/retry — re-send a failed message
router.post('/logs/:id/retry', auth, requirePermission('system', 'notifications'), async (req, res) => {
  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram not configured' });
  }
  try {
    const sqlite = getSQLite();
    const row    = sqlite.prepare('SELECT * FROM telegram_logs WHERE id = ?').get(Number(req.params.id));
    if (!row)    return res.status(404).json({ ok: false, error: 'Log entry not found' });
    if (!row.message) return res.status(400).json({ ok: false, error: 'No message stored for this entry (pre-dates retry feature)' });

    const result = await sendMessage(row.message, row.trigger);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/rankings/send — manual send with optional custom period and channel selection
router.post('/rankings/send', auth, requirePermission('system', 'notifications'), async (req, res) => {
  const { period, weekStart, monthOf, channels } = req.body;
  if (!['weekly', 'monthly'].includes(period)) {
    return res.status(400).json({ ok: false, error: 'period must be "weekly" or "monthly"' });
  }

  const sendToTelegram = !channels || channels.includes('telegram');
  const sendToWhatsApp = !channels || channels.includes('whatsapp');

  if (sendToTelegram && !isConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram not configured — save your Bot Token and Chat ID first.' });
  }

  const trigger  = `rankings_${period}`;
  const template = getTemplate(trigger);
  if (!template) {
    return res.status(400).json({ ok: false, error: `Template for ${trigger} is disabled` });
  }

  try {
    const db      = getDb();
    const options = {};
    if (period === 'weekly'  && weekStart) options.weekStart = weekStart;
    if (period === 'monthly' && monthOf) {
      if (!/^\d{4}-\d{2}$/.test(monthOf)) return res.status(400).json({ ok: false, error: 'monthOf must be in YYYY-MM format' });
      options.monthOf = monthOf;
    }

    const vars    = await buildRankingsVars(db, period, getRankingsTopN(), options);
    const message = renderTemplate(template, vars);

    const sends = [];
    if (sendToTelegram && isConfigured())   sends.push(sendMessage(message, trigger));
    if (sendToWhatsApp && isWAConfigured()) sends.push(sendWhatsApp(message, trigger));

    if (!sends.length) return res.status(400).json({ ok: false, error: 'No configured channels selected' });

    const [primary] = await Promise.allSettled(sends);
    res.json(primary.status === 'fulfilled' ? primary.value : { ok: false, reason: primary.reason?.message });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/resend-for-bet — re-send a notification for a bet by booking code
router.post('/resend-for-bet', auth, requirePermission('system', 'notifications'), async (req, res) => {
  const { bookingCode, trigger } = req.body;
  if (!bookingCode?.trim()) return res.status(400).json({ ok: false, error: 'bookingCode is required' });

  try {
    const db  = getDb();
    const bet = await db.collection('game_bet').findOne({ bookingCode: bookingCode.trim() });
    if (!bet) return res.status(404).json({ ok: false, error: `No bet found with booking code: ${bookingCode.trim()}` });

    const multi          = isMultiplayer(bet);
    const defaultTrigger = multi ? 'game_bet_multi_created' : 'game_bet';
    const useTrigger     = trigger || defaultTrigger;

    const validTrigger = TRIGGERS.find((t) => t.trigger === useTrigger);
    if (!validTrigger) return res.status(400).json({ ok: false, error: `Unknown trigger: ${useTrigger}` });

    const currentPlayers = getCurrentPlayers(bet);
    const [creatorName, allFixtures] = await Promise.all([
      resolveCreator(db, bet),
      resolveAllFixtures(db, bet),
    ]);

    let vars;
    if (multi) {
      vars = buildMultiVars(bet, allFixtures, creatorName, currentPlayers);
      // Add countdown vars in case template uses them
      const primaryFixture = allFixtures[0] || {};
      if (primaryFixture.kickoff) {
        const kickoffMs = new Date(primaryFixture.kickoff).getTime();
        if (!isNaN(kickoffMs)) {
          vars.minutes_until_match = Math.round((kickoffMs - Date.now()) / 60000);
          vars.kickoff_time = new Date(kickoffMs).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
          });
        }
      }
    } else {
      const fixture  = allFixtures[0] || {};
      const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
      vars = {
        home_team:  fixture.homeTeam || '—',
        away_team:  fixture.awayTeam || '—',
        league:     fixture.league   || '—',
        stake:      stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : '—',
        code:       bet.bookingCode  || bet._id.toString(),
        creator:    creatorName      || '—',
        mode:       formatMode(bet),
        slots:      bet.capacity ?? bet.maxParticipants ?? '—',
      };
      if (fixture.kickoff) {
        const kickoffMs = new Date(fixture.kickoff).getTime();
        if (!isNaN(kickoffMs)) {
          vars.kickoff_time        = new Date(kickoffMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
          vars.minutes_until_match = Math.round((kickoffMs - Date.now()) / 60000);
        }
      }
    }

    const template = getTemplate(useTrigger) || validTrigger.default;
    const message  = renderTemplate(template, vars);
    const result   = await notifyAll(message, useTrigger);
    res.json({ ...result, message, trigger: useTrigger, code: bet.bookingCode || bet._id.toString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/telegram/send — manual message from admin
router.post('/send', auth, requirePermission('system', 'notifications'), async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  if (!isConfigured()) return res.status(400).json({ ok: false, error: 'Telegram not configured' });
  const result = await sendMessage(text.trim());
  res.json(result);
});

module.exports = router;
