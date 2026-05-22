const express = require('express');
const { ObjectId } = require('mongodb');
const { sendMessage, isConfigured, getConfig } = require('../telegram');
const { sendMessage: sendWhatsApp, isConfigured: isWAConfigured } = require('../whatsapp');
const {
  DEFAULT_TEMPLATES,
  GAME_BET_MACROS,
  MULTI_BASE_MACROS,
  COUNTDOWN_MACROS,
  LARGE_STAKE_MACROS,
  SINGLE_COUNTDOWN_MACROS,
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
  {
    trigger:     'game_bet_single_1hr',
    group:       'single',
    label:       'Match Countdown — 1 Hour',
    description: 'Fired 1 hour before match kickoff for single-mode bets',
    macros:      SINGLE_COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_single_1hr,
  },
  {
    trigger:     'game_bet_single_30min',
    group:       'single',
    label:       'Match Countdown — 30 Minutes',
    description: 'Fired 30 minutes before match kickoff for single-mode bets',
    macros:      SINGLE_COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_single_30min,
  },
  {
    trigger:     'game_bet_single_15min',
    group:       'single',
    label:       'Match Countdown — 15 Minutes',
    description: 'Fired 15 minutes before match kickoff for single-mode bets',
    macros:      SINGLE_COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_single_15min,
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
    trigger:     'game_bet_match_1hr',
    group:       'multi',
    label:       'Match Countdown — 1 Hour',
    description: 'Fired 1 hour before kickoff for multiplayer challenges with 2+ players',
    macros:      COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_match_1hr,
  },
  {
    trigger:     'game_bet_match_30min',
    group:       'multi',
    label:       'Match Countdown — 30 Minutes',
    description: 'Fired 30 minutes before kickoff for multiplayer challenges with 2+ players',
    macros:      COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_match_30min,
  },
  {
    trigger:     'game_bet_match_15min',
    group:       'multi',
    label:       'Match Countdown — 15 Minutes',
    description: 'Fired 15 minutes before kickoff for multiplayer challenges with 2+ players',
    macros:      COUNTDOWN_MACROS,
    default:     DEFAULT_TEMPLATES.game_bet_match_15min,
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
router.get('/status', auth, (req, res) => {
  const { token, chatId } = getConfig();
  const row = getSQLite().prepare("SELECT value FROM admin_settings WHERE key = 'telegram_enabled'").get();
  const enabled = row ? row.value !== '0' : true;
  res.json({
    configured:      !!(token && chatId),
    botTokenSet:     !!token,
    chatIdSet:       !!chatId,
    botTokenPreview: token ? token.slice(0, 8) + '…' : null,
    chatId:          chatId || null,
    enabled,
  });
});

// GET /api/telegram/config — returns current saved values (token masked)
router.get('/config', auth, (req, res) => {
  const { token, chatId } = getConfig();
  const sqlite = getSQLite();
  const threshold = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = 'large_stake_threshold'")
    .get();
  const topN = sqlite
    .prepare("SELECT value FROM admin_settings WHERE key = 'rankings_top_n'")
    .get();
  res.json({
    botToken:           token ? token.slice(0, 8) + '…' + token.slice(-4) : '',
    chatId:             chatId || '',
    largeStakeThreshold: threshold ? Number(threshold.value) : 7,
    rankingsTopN:        topN ? Number(topN.value) : 10,
  });
});

// POST /api/telegram/config — save bot token, chat ID, and/or threshold
router.post('/config', auth, (req, res) => {
  const { botToken, chatId, largeStakeThreshold, rankingsTopN, enabled } = req.body;

  const hasToken     = botToken != null && String(botToken).trim() !== '';
  const hasChatId    = chatId   != null && String(chatId).trim()   !== '';
  const hasThreshold = largeStakeThreshold != null && Number(largeStakeThreshold) > 0;
  const hasTopN      = rankingsTopN != null && Number.isInteger(Number(rankingsTopN)) && Number(rankingsTopN) >= 1;
  const hasEnabled   = enabled != null;

  if (!hasToken && !hasChatId && !hasThreshold && !hasTopN && !hasEnabled) {
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
    if (hasThreshold) upsert.run('large_stake_threshold', String(Number(largeStakeThreshold)));
    if (hasTopN)      upsert.run('rankings_top_n', String(Math.min(25, Math.max(1, Number(rankingsTopN)))));
    if (hasEnabled)   upsert.run('telegram_enabled', enabled ? '1' : '0');

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
// ?channel=telegram|whatsapp|all  (default: telegram)
router.get('/logs', auth, (req, res) => {
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
router.get('/templates', auth, (req, res) => {
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

// POST /api/telegram/templates/:trigger/test — send a test preview to all configured channels
router.post('/templates/:trigger/test', auth, async (req, res) => {
  const valid = TRIGGERS.find((t) => t.trigger === req.params.trigger);
  if (!valid) return res.status(404).json({ ok: false, error: 'Unknown trigger' });

  if (!isConfigured()) {
    return res.status(400).json({ ok: false, error: 'Telegram not configured' });
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
    };

    // Get the saved (or default) template
    const template = getTemplate(req.params.trigger) || valid.default;
    const testMsg  = '[TEST] ' + renderTemplate(template, sampleVars);

    const triggerKey = req.params.trigger + '_test';
    const sends = [sendMessage(testMsg, triggerKey)];
    if (isWAConfigured()) sends.push(sendWhatsApp(testMsg, triggerKey));
    const [tgResult] = await Promise.allSettled(sends);
    res.json(tgResult.status === 'fulfilled' ? tgResult.value : { ok: false, reason: tgResult.reason?.message });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/telegram/watcher-status
router.get('/watcher-status', auth, (req, res) => {
  res.json(getWatcherState());
});

// POST /api/telegram/logs/:id/retry — re-send a failed message
router.post('/logs/:id/retry', auth, async (req, res) => {
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
router.post('/rankings/send', auth, async (req, res) => {
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
router.post('/resend-for-bet', auth, async (req, res) => {
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
router.post('/send', auth, async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ ok: false, error: 'text is required' });
  if (!isConfigured()) return res.status(400).json({ ok: false, error: 'Telegram not configured' });
  const result = await sendMessage(text.trim());
  res.json(result);
});

module.exports = router;
