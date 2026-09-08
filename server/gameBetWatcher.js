const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { getDb: getSQLite } = require('./sqlite');
const { sendMessage, sendPhoto, sendToChannel: sendTgChannel, sendPhotoToChannel: sendTgChannelPhoto, isConfigured, isChannelConfigured: isTgChannelConfigured } = require('./telegram');
const { sendMessage: sendWhatsApp, sendMediaMessage: sendWhatsAppMedia, isConfigured: isWAConfigured, getConfig: getWAConfig, sendDM, sendDirectMessage, sendWelcomeTemplate, normalizePhone } = require('./whatsapp');
const { buildContestForBet } = require('./contestShape');
const {
  getConfig: chatwootConfig, isConfigured: chatwootConfigured,
  pushContact: pushChatwootContact, recordSync: recordChatwootSync, contactName,
} = require('./chatwoot');
const { renderWagerCard } = require('./wagerCard');

const POLL_INTERVAL_MS     = 2 * 60 * 1000; // 2 min — fill progress + countdowns + settled
const NEW_BET_INTERVAL_MS  = 30 * 1000;      // 30 sec — new bets only
const USER_DM_INTERVAL_MS  = 5 * 60 * 1000; // 5 min — new user welcome DMs

// ── Watcher health state ───────────────────────────────────────────────────────

const watcherState = {
  started:            false,
  startedAt:          null,
  lastNewBetPoll:     null,
  lastProgressPoll:   null,
  lastUserDmPoll:     null,
  lastError:          null,
  lastErrorAt:        null,
  newBetPollCount:    0,
  progressPollCount:  0,
  userDmPollCount:    0,
};

function getWatcherState() {
  try {
    const sqlite = getSQLite();
    const get = (key) => sqlite.prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value || null;
    const getBool = (key, def = true) => {
      const v = get(key);
      return v === null ? def : v !== '0';
    };
    return {
      ...watcherState,
      rankingsWeeklySentAt:   get('rankings_weekly_sent_at'),
      rankingsMonthlySentAt:  get('rankings_monthly_sent_at'),
      lastUserDmCheckAt:      get('whatsapp_dm_last_check_at'),
      pollNewBetEnabled:      getBool('poll_newbet_enabled'),
      pollProgressEnabled:    getBool('poll_progress_enabled'),
      pollUserDmEnabled:      getBool('whatsapp_dm_enabled'),
    };
  } catch {
    return { ...watcherState, rankingsWeeklySentAt: null, rankingsMonthlySentAt: null, lastUserDmCheckAt: null, pollNewBetEnabled: true, pollProgressEnabled: true, pollUserDmEnabled: true };
  }
}

function isPollEnabled(key, def = true) {
  try {
    const v = getSQLite().prepare('SELECT value FROM admin_settings WHERE key = ?').get(key)?.value;
    return v === null || v === undefined ? def : v !== '0';
  } catch {
    return def;
  }
}

// ── Default templates ──────────────────────────────────────────────────────────

const DEFAULT_TEMPLATES = {
  game_bet: `🎯 New Challenge Created!

⚽ {{home_team}} vs {{away_team}}

Mode: {{mode}}
Code: {{code}}
Created by: {{creator}}
Stake: {{stake}}
Slots: {{slots}}

Open the VermoSports app to join!`,

  game_bet_single_1hr: `⏰ Your Match is in 1 Hour!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Kickoff: {{kickoff_time}}
Stake: {{stake}} | Code: {{code}}`,

  game_bet_single_30min: `⏰ Match Kicks Off in 30 Minutes!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Kickoff: {{kickoff_time}}
Stake: {{stake}} | Code: {{code}}`,

  game_bet_single_15min: `🚀 Your Match Starts in 15 Minutes!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Kickoff: {{kickoff_time}}
Stake: {{stake}} | Code: {{code}}`,

  game_bet_multi_created: `🎯 New Multiplayer Challenge!

{{fixtures_list}}
🏆 {{league}}

Players: {{current_players}}/{{max_players}} joined
Stake: {{stake}} per player
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}
Created by: {{creator}}

Open the app to join!`,

  game_bet_multi_half: `⚡ Challenge Halfway There!

{{fixtures_list}}
{{current_players}}/{{max_players}} players joined ({{fill_percent}} filled)
{{slots_remaining}} slots remaining
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}`,

  game_bet_multi_almost_3: `🔥 Almost Full — 3 Slots Left!

{{fixtures_list}}
{{current_players}}/{{max_players}} players joined
Stake: {{stake}}
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}`,

  game_bet_multi_almost_1: `🚨 Last Spot Available!

{{fixtures_list}}
{{current_players}}/{{max_players}} players joined
Stake: {{stake}}
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}`,

  game_bet_match_1hr: `⏰ Match in 1 Hour!

{{fixtures_list}}
{{current_players}} players in the challenge
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_match_30min: `⏰ Match Kicks Off in 30 Minutes!

{{fixtures_list}}
{{current_players}} players ready
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_match_15min: `🚀 Match Starting in 15 Minutes!

{{fixtures_list}}
{{current_players}} players competing
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_large_stake: `💰 Large Stake Alert!

{{fixtures_list}}
🏆 {{league}}

Stake: {{stake}} per player
Current Pot: {{current_pot}} | Potential: {{potential_pot}} ({{max_players}} slots)
Mode: {{mode}} | Code: {{code}}
Creator: {{creator}}`,

  game_bet_settled: `🏆 Challenge Settled, {{recipient}}!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Your result: {{your_result}}
🥇 Winner: {{winner}}
💰 Winner's earnings: {{earnings}}

Stake: {{stake}}/player | Players: {{players_joined}}/{{max_players}}
Net Pot: {{current_pot}} | Code: {{code}}`,

  rankings_weekly: `📊 Weekly Rankings

Top players this week on VermoSports:

{{top_players}}

{{total_players}} players competed this week
Generated: {{generated_at}}`,

  rankings_monthly: `📊 Monthly Rankings

Top players this month on VermoSports:

{{top_players}}

{{total_players}} players competed this month
Generated: {{generated_at}}`,

  game_bet_countdown_grouped: `⏰ {{count}} Challenges Starting in {{time_label}}!

{{bets_list}}

Open the VermoSports app to join! 🚀`,

  game_bet_countdown_1hr: `⏰ {{count}} Challenge(s) Starting in 1 Hour!

{{bets_list_full}}

Open the VermoSports app to join! 🚀`,

  game_bet_countdown_30min: `⏰ {{count}} Challenge(s) Starting in 30 Minutes!

{{bets_list_full}}

Open the VermoSports app to join! 🚀`,

  game_bet_countdown_15min: `🚀 {{count}} Challenge(s) Starting in 15 Minutes!

{{bets_list_full}}

Open the VermoSports app to join! 🚀`,
};

// Backward-compat alias
const DEFAULT_TEMPLATE = DEFAULT_TEMPLATES.game_bet;

// ── Macro definitions ──────────────────────────────────────────────────────────

const GAME_BET_MACROS = [
  { key: '{{code}}',      desc: 'Challenge booking code' },
  { key: '{{creator}}',   desc: 'Username of creator' },
  { key: '{{stake}}',     desc: 'Bet stake amount (e.g. $10.00)' },
  { key: '{{home_team}}', desc: 'Home team name' },
  { key: '{{away_team}}', desc: 'Away team name' },
  { key: '{{mode}}',      desc: 'Bet mode (e.g. Multiplayer)' },
  { key: '{{slots}}',     desc: 'Max participants' },
  { key: '{{league}}',    desc: 'League name' },
  { key: '{{bet_type}}',  desc: 'Bet type (e.g. SHOTSOFFGOAL)' },
  { key: '{{handicap}}',  desc: 'Handicap value from optionsCreatedBy (blank if not set)' },
];

const MULTI_BASE_MACROS = [
  { key: '{{fixtures_list}}',   desc: 'All fixtures in the bet, one per line (• Home vs Away)' },
  { key: '{{home_team}}',       desc: 'Home team name (first fixture)' },
  { key: '{{away_team}}',       desc: 'Away team name (first fixture)' },
  { key: '{{league}}',          desc: 'League name' },
  { key: '{{stake}}',           desc: 'Stake per player (e.g. $10.00)' },
  { key: '{{max_players}}',     desc: 'Maximum number of participants' },
  { key: '{{current_players}}', desc: 'Current number of participants' },
  { key: '{{slots_remaining}}', desc: 'Remaining open slots' },
  { key: '{{fill_percent}}',    desc: 'How full the challenge is (e.g. 60%)' },
  { key: '{{current_pot}}',     desc: 'Prize pot based on players who have joined (e.g. $9.00)' },
  { key: '{{potential_pot}}',   desc: 'Prize pot if all slots fill (e.g. $15.00)' },
  { key: '{{creator}}',         desc: 'Username of creator' },
  { key: '{{code}}',            desc: 'Challenge booking code' },
];

const COUNTDOWN_MACROS = [
  ...MULTI_BASE_MACROS,
  { key: '{{minutes_until_match}}', desc: 'Minutes until kickoff' },
  { key: '{{kickoff_time}}',        desc: 'Formatted kickoff time (e.g. 20:00)' },
];

const LARGE_STAKE_MACROS = [
  ...MULTI_BASE_MACROS,
  { key: '{{mode}}', desc: 'Bet mode (e.g. Multiplayer)' },
];

const SINGLE_COUNTDOWN_MACROS = [
  { key: '{{home_team}}',           desc: 'Home team name' },
  { key: '{{away_team}}',           desc: 'Away team name' },
  { key: '{{league}}',              desc: 'League name' },
  { key: '{{stake}}',               desc: 'Bet stake amount' },
  { key: '{{code}}',                desc: 'Challenge booking code' },
  { key: '{{creator}}',             desc: 'Creator username' },
  { key: '{{kickoff_time}}',        desc: 'Formatted kickoff time (e.g. 20:00)' },
  { key: '{{minutes_until_match}}', desc: 'Minutes until kickoff' },
];

const GROUPED_COUNTDOWN_MACROS = [
  { key: '{{count}}',          desc: 'Number of challenges starting in this window' },
  { key: '{{bets_list}}',      desc: 'One line per challenge — teams and player count only (compact)' },
  { key: '{{bets_list_full}}', desc: 'One line per challenge — includes code and kickoff time' },
];

const RANKINGS_MACROS = [
  { key: '{{period}}',        desc: 'Period label (e.g. This Week / This Month / May 2025)' },
  { key: '{{week}}',          desc: 'Week date range, e.g. 12 May – 18 May 2025 (weekly only)' },
  { key: '{{month}}',         desc: 'Full month name and year, e.g. May 2025 (monthly only)' },
  { key: '{{generated_at}}',  desc: 'Date/time this ranking was generated' },
  { key: '{{top_players}}',   desc: 'Formatted leaderboard list (top N players with scores)' },
  { key: '{{total_players}}', desc: 'Total number of players who competed in the period' },
];

const SETTLED_MACROS = [
  { key: '{{recipient}}',      desc: 'Recipient username (the player receiving this DM)' },
  { key: '{{your_result}}',    desc: 'Result for this recipient — "Won 🏆" or "Lost"' },
  { key: '{{home_team}}',      desc: 'Home team name' },
  { key: '{{away_team}}',      desc: 'Away team name' },
  { key: '{{league}}',         desc: 'League name' },
  { key: '{{winner}}',         desc: 'Winner username' },
  { key: '{{earnings}}',       desc: 'Winner earnings after fees (e.g. $10.64)' },
  { key: '{{stake}}',          desc: 'Stake per player' },
  { key: '{{current_pot}}',    desc: 'Actual pot (players who joined, minus fees)' },
  { key: '{{potential_pot}}',  desc: 'Pot if all slots had filled (no fees)' },
  { key: '{{players_joined}}', desc: 'Number of players who joined' },
  { key: '{{max_players}}',    desc: 'Maximum capacity' },
  { key: '{{code}}',           desc: 'Challenge booking code' },
  { key: '{{mode}}',           desc: 'Bet mode' },
];

// ── Template helpers ───────────────────────────────────────────────────────────

function getTemplate(trigger) {
  try {
    const row = getSQLite()
      .prepare('SELECT template, enabled FROM telegram_templates WHERE trigger = ?')
      .get(trigger);
    if (row && !row.enabled) return null;
    return row?.template || DEFAULT_TEMPLATES[trigger] || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATES[trigger] || DEFAULT_TEMPLATE;
  }
}

function renderTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v ?? '—'),
    template,
  );
}

// ── MongoDB helpers ────────────────────────────────────────────────────────────

const toOid = (val) => { try { return new ObjectId(String(val)); } catch { return null; } };

async function resolveTeamName(db, val) {
  if (!val) return null;
  if (val && typeof val === 'object' && !(val instanceof ObjectId))
    return val.name || val.teamName || null;
  const t = await db.collection('football_teams').findOne(
    { _id: toOid(val) }, { projection: { name: 1 } },
  );
  return t?.name || null;
}

async function resolveFixture(db, bet) {
  const fallbackKickoff = bet.possibleStartPeriod || null;
  if (!bet.gameFixtureId) return { homeTeam: null, awayTeam: null, league: null, kickoff: fallbackKickoff };
  try {
    const fx = await db.collection('football_fixtures').findOne({ _id: toOid(bet.gameFixtureId) });
    if (!fx) return { homeTeam: null, awayTeam: null, league: null, kickoff: fallbackKickoff };
    const [homeTeam, awayTeam] = await Promise.all([
      resolveTeamName(db, fx.homeTeam),
      resolveTeamName(db, fx.awayTeam),
    ]);
    let league = null;
    if (bet.gameLeagueId) {
      const lg = await db.collection('football_leagues').findOne(
        { _id: toOid(bet.gameLeagueId) }, { projection: { leagueName: 1, name: 1 } },
      );
      league = lg ? (lg.leagueName || lg.name) : null;
    }
    const kickoff = fx.firstPeriod || fx.date || fx.fixture?.date || fallbackKickoff;
    return { homeTeam, awayTeam, league, kickoff };
  } catch {
    return { homeTeam: null, awayTeam: null, league: null, kickoff: null };
  }
}

async function resolveAllFixtures(db, bet) {
  // Collect unique fixture IDs from the bet-level ID and all participant fixtures
  const ids = new Set();
  if (bet.gameFixtureId) ids.add(String(bet.gameFixtureId));
  if (Array.isArray(bet.participants)) {
    for (const p of bet.participants) {
      if (Array.isArray(p.fixtures)) {
        for (const f of p.fixtures) {
          if (f.gameFixtureId) ids.add(String(f.gameFixtureId));
        }
      }
    }
  }

  const fallback = [{ homeTeam: null, awayTeam: null, league: null, kickoff: bet.possibleStartPeriod || null }];
  if (!ids.size) return fallback;

  try {
    const oids    = [...ids].map(toOid).filter(Boolean);
    const fxDocs  = await db.collection('football_fixtures').find({ _id: { $in: oids } }).toArray();

    let league = null;
    if (bet.gameLeagueId) {
      const lg = await db.collection('football_leagues').findOne(
        { _id: toOid(bet.gameLeagueId) }, { projection: { leagueName: 1, name: 1 } },
      );
      league = lg ? (lg.leagueName || lg.name) : null;
    }

    const fixtures = await Promise.all(fxDocs.map(async (fx) => {
      const [homeTeam, awayTeam] = await Promise.all([
        resolveTeamName(db, fx.homeTeam),
        resolveTeamName(db, fx.awayTeam),
      ]);
      const kickoff = fx.firstPeriod || fx.date || fx.fixture?.date || bet.possibleStartPeriod || null;
      return { homeTeam, awayTeam, league, kickoff };
    }));

    // Ensure the primary fixture (bet.gameFixtureId) is first
    if (bet.gameFixtureId && fxDocs.length > 1) {
      const primaryIdx = fxDocs.findIndex((fx) => String(fx._id) === String(bet.gameFixtureId));
      if (primaryIdx > 0) {
        const [primary] = fixtures.splice(primaryIdx, 1);
        fixtures.unshift(primary);
      }
    }

    return fixtures.length ? fixtures : fallback;
  } catch {
    return fallback;
  }
}

async function resolveCreator(db, bet) {
  const uid = bet.createdBy;
  if (!uid) return null;
  try {
    const user = await db.collection('users').findOne(
      { _id: toOid(uid) },
      { projection: { username: 1, displayName: 1, name: 1 } },
    );
    return user ? (user.username || user.displayName || user.name || null) : null;
  } catch {
    return null;
  }
}

function formatMode(bet) {
  const mode = bet.betMode;
  if (mode) return String(mode);
  const slots = Number(bet.capacity || bet.maxParticipants);
  if (slots === 2) return 'Head-to-Head';
  if (slots > 2)  return 'Multiplayer';
  return 'Single';
}

function isMultiplayer(bet) {
  // betMode is authoritative — never override it with capacity
  if (bet.betMode) return String(bet.betMode).toUpperCase() !== 'SINGLE';
  // No betMode: infer from capacity (single = 2 slots, multi = 3+)
  return Number(bet.capacity || bet.maxParticipants) > 2;
}

function getCurrentPlayers(bet) {
  if (Array.isArray(bet.participants)) return bet.participants.length;
  if (Array.isArray(bet.players)) return bet.players.length;
  if (typeof bet.currentParticipants === 'number') return bet.currentParticipants;
  if (typeof bet.participantCount === 'number') return bet.participantCount;
  return 1;
}

// ── Channel enable helpers ─────────────────────────────────────────────────────

function isChannelEnabled(channel) {
  try {
    const row = getSQLite()
      .prepare('SELECT value FROM admin_settings WHERE key = ?')
      .get(`${channel}_enabled`);
    return row ? row.value !== '0' : true; // default: enabled
  } catch {
    return true;
  }
}

// ── Multi-channel send ─────────────────────────────────────────────────────────
// Sends to all configured + enabled channels; Telegram result is primary
// for dedup logic so a WhatsApp failure never blocks markNotified().

async function notifyAll(text, trigger) {
  const sends = [];
  if (isConfigured()   && isChannelEnabled('telegram'))  sends.push(sendMessage(text, trigger));
  // Mirrored to the Telegram channel when one is configured; independently
  // switchable via telegram_channel_enabled.
  if (isTgChannelConfigured() && isChannelEnabled('telegram_channel')) sends.push(sendTgChannel(text, trigger));
  if (isWAConfigured() && isChannelEnabled('whatsapp'))  sends.push(sendWhatsApp(text, trigger));
  if (!sends.length) return { ok: false, reason: 'no_channels_enabled' };
  const [primary] = await Promise.allSettled(sends);
  return primary.status === 'fulfilled' ? primary.value : { ok: false, reason: primary.reason?.message };
}

// Telegram rejects photo captions longer than 1024 characters, so the caption
// is capped for both channels to keep the two messages identical.
const CAPTION_MAX = 1024;
function toCaption(text) {
  const t = String(text || '');
  return t.length <= CAPTION_MAX ? t : t.slice(0, CAPTION_MAX - 1) + '…';
}

// Same channel/enablement rules as notifyAll, but sends an image with the
// notification text as its caption.
async function notifyAllMedia({ buffer, mimetype, filename }, text, trigger) {
  const caption = toCaption(text);
  const sends = [];
  if (isConfigured() && isChannelEnabled('telegram')) {
    sends.push(sendPhoto(buffer, mimetype, filename, caption, trigger));
  }
  if (isTgChannelConfigured() && isChannelEnabled('telegram_channel')) {
    sends.push(sendTgChannelPhoto(buffer, mimetype, filename, caption, trigger));
  }
  if (isWAConfigured() && isChannelEnabled('whatsapp')) {
    sends.push(sendWhatsAppMedia({
      base64: buffer.toString('base64'), mimetype, filename, caption,
    }, trigger));
  }
  if (!sends.length) return { ok: false, reason: 'no_channels_enabled' };
  const [primary] = await Promise.allSettled(sends);
  return primary.status === 'fulfilled' ? primary.value : { ok: false, reason: primary.reason?.message };
}

// Multiplayer bet creation is announced with a screenshot of the Prize Projector
// card (Maximum pot base) captioned with the usual notification text. Rendering
// is best-effort: any failure falls back to the plain-text notification so an
// image problem can never cost us the alert.
async function notifyNewMultiBet(db, bet, message, trigger) {
  try {
    const contest = await buildContestForBet(db, bet);
    // Any bet isMultiplayer() accepts gets a card — that's capacity 3+ (or a
    // non-SINGLE betMode). Tiers below 5 fall into the 5-slot split, which
    // still sums exactly to the pot. Guard only against data that can't render.
    if (contest && contest.capacity >= 3 && contest.amount > 0) {
      const card = await renderWagerCard(contest, 'maximum');
      if (card) return await notifyAllMedia(card, message, trigger);
    }
  } catch (err) {
    console.error('[GameBetWatcher] wager card render failed:', err.message);
  }
  return notifyAll(message, trigger);
}

// ── SQLite dedup helpers ───────────────────────────────────────────────────────

function hasNotified(betId, key) {
  try {
    const row = getSQLite()
      .prepare('SELECT id FROM telegram_notified WHERE bet_id = ? AND trigger_key = ?')
      .get(String(betId), key);
    return !!row;
  } catch {
    return false;
  }
}

function markNotified(betId, key) {
  try {
    getSQLite()
      .prepare('INSERT OR IGNORE INTO telegram_notified (bet_id, trigger_key) VALUES (?, ?)')
      .run(String(betId), key);
  } catch {
    // ignore
  }
}

// Track per-user DM failures within a bet using sub-keys (no schema change).
// Returns true when the failure count reaches MAX_DM_AUTO_RETRIES (give up).
function recordDmFailureAndCheckGiveUp(betId, key) {
  let count = 0;
  for (let n = 1; n <= MAX_DM_AUTO_RETRIES; n++) {
    if (hasNotified(betId, `${key}_f${n}`)) count = n; else break;
  }
  const next = count + 1;
  markNotified(betId, `${key}_f${next}`);
  return next >= MAX_DM_AUTO_RETRIES;
}

// ── lastChecked persistence ────────────────────────────────────────────────────

function readLastChecked() {
  try {
    const row = getSQLite()
      .prepare("SELECT value FROM admin_settings WHERE key = 'watcher_last_checked'")
      .get();
    if (row?.value) {
      const d = new Date(row.value);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // ignore
  }
  return new Date(); // first run: start from now
}

function saveLastChecked(date) {
  try {
    getSQLite().prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('watcher_last_checked', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(date.toISOString());
  } catch {
    // non-fatal
  }
}

// ── Cleanup old notified rows ──────────────────────────────────────────────────

function cleanupOldNotified() {
  try {
    const info = getSQLite()
      .prepare("DELETE FROM telegram_notified WHERE notified_at < datetime('now', '-30 days')")
      .run();
    if (info.changes > 0) {
      console.log(`[GameBetWatcher] Cleaned up ${info.changes} old telegram_notified rows`);
    }
  } catch {
    // non-fatal
  }
}

function cleanupOldLogs() {
  try {
    const info = getSQLite()
      .prepare("DELETE FROM telegram_logs WHERE created_at < datetime('now', '-90 days')")
      .run();
    if (info.changes > 0) {
      console.log(`[GameBetWatcher] Cleaned up ${info.changes} old telegram_logs rows`);
    }
  } catch {
    // non-fatal
  }
}

// ── User DM helpers ────────────────────────────────────────────────────────────

function isWADmEnabled() {
  try {
    const row = getSQLite().prepare('SELECT value FROM admin_settings WHERE key = ?').get('whatsapp_dm_enabled');
    return row ? row.value === '1' : false;
  } catch {
    return false;
  }
}

function readLastUserDmCheck() {
  try {
    const row = getSQLite().prepare("SELECT value FROM admin_settings WHERE key = 'whatsapp_dm_last_check_at'").get();
    if (row?.value) {
      const d = new Date(row.value);
      if (!isNaN(d.getTime())) return d;
    }
  } catch { /* ignore */ }
  return new Date(Date.now() - 24 * 60 * 60 * 1000); // default: 24h ago
}

function saveLastUserDmCheck(date) {
  try {
    getSQLite().prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES ('whatsapp_dm_last_check_at', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(date.toISOString());
  } catch { /* non-fatal */ }
}

function hasUserDmSent(userId, trigger) {
  try {
    const row = getSQLite()
      .prepare('SELECT ok FROM whatsapp_user_dms WHERE user_id = ? AND trigger = ?')
      .get(String(userId), trigger);
    return row ? row.ok === 1 : false;
  } catch {
    return false;
  }
}

const MAX_DM_AUTO_RETRIES = 3;

function countUserDmFailures(userId, trigger) {
  try {
    const row = getSQLite()
      .prepare('SELECT COUNT(*) as c FROM whatsapp_user_dms WHERE user_id = ? AND trigger = ? AND ok = 0')
      .get(String(userId), trigger);
    return row?.c || 0;
  } catch {
    return 0;
  }
}

function getWelcomeConfig() {
  try {
    const get = (k) => getSQLite().prepare('SELECT value FROM admin_settings WHERE key = ?').get(k)?.value || '';
    return {
      groupLink:   get('whatsapp_group_link')  || '',
      channelLink: get('whatsapp_channel_link') || '',
    };
  } catch {
    return { groupLink: '', channelLink: '' };
  }
}

// Pushes users that aren't in chatwoot_contacts yet. Bounded per run so a big
// backlog trickles through rather than hammering Chatwoot — use the dashboard's
// "Sync all contacts" for the initial backfill.
const CHATWOOT_POLL_LIMIT = 50;

async function pollChatwootContacts(db) {
  const cfg = chatwootConfig();
  if (!chatwootConfigured(cfg) || !cfg.autoSync) return;

  const sqlite = getSQLite();
  const known = sqlite.prepare('SELECT user_id FROM chatwoot_contacts').all()
    .map((r) => r.user_id)
    .filter((id) => /^[0-9a-f]{24}$/i.test(id))
    .map((id) => { try { return new ObjectId(id); } catch { return null; } })
    .filter(Boolean);

  const filter = {
    $and: [
      { $or: [
        { mobile: { $exists: true, $nin: [null, ''] } },
        { email:  { $exists: true, $nin: [null, ''] } },
      ] },
      ...(known.length ? [{ _id: { $nin: known } }] : []),
    ],
  };

  const users = await db.collection('users')
    .find(filter, { projection: { username: 1, displayName: 1, name: 1, fullName: 1, email: 1, mobile: 1, phone: 1 } })
    .sort({ createdAt: -1 })
    .limit(CHATWOOT_POLL_LIMIT)
    .toArray();

  for (const user of users) {
    const phoneDigits = normalizePhone(user.mobile || user.phone || '');
    const result = await pushChatwootContact(user, phoneDigits, cfg);
    recordChatwootSync(user._id, {
      contactId: result.contactId,
      phone: phoneDigits || null,
      email: user.email || null,
      name: contactName(user),
      ok: result.ok,
      error: result.error,
    });
    await new Promise((r) => setTimeout(r, 250));
  }
  if (users.length) console.log(`[Chatwoot] auto-synced ${users.length} new contact(s)`);
}

async function pollNewUsers(db) {
  if (!isWADmEnabled()) return;

  const sqlite = getSQLite();

  // Build exclusion list from SQLite so MongoDB only returns users who still need a DM
  const sentIds = sqlite
    .prepare("SELECT DISTINCT user_id FROM whatsapp_user_dms WHERE trigger = 'user_registered' AND ok = 1")
    .all()
    .map((r) => r.user_id);

  const maxedIds = sqlite
    .prepare(`SELECT user_id FROM whatsapp_user_dms WHERE trigger = 'user_registered' AND ok = 0 GROUP BY user_id HAVING COUNT(*) >= ${MAX_DM_AUTO_RETRIES}`)
    .all()
    .map((r) => r.user_id);

  const excludeStrings = [...new Set([...sentIds, ...maxedIds])];
  const excludeOIds = excludeStrings
    .filter((id) => id && id !== '__test__' && /^[0-9a-f]{24}$/i.test(id))
    .map((id) => { try { return new ObjectId(id); } catch { return null; } })
    .filter(Boolean);

  // Newest first so fresh registrations are processed immediately
  const candidates = await db.collection('users')
    .find({
      mobile: { $exists: true, $nin: ['', null] },
      ...(excludeOIds.length ? { _id: { $nin: excludeOIds } } : {}),
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  let sent = 0;

  for (const user of candidates) {
    if (sent >= 10) break;
    const userId = user._id.toString();
    const username = user.username || user.name || user.displayName || 'there';

    const result = await sendWelcomeTemplate(userId, user.mobile, username);
    if (result.ok) {
      console.log(`[GameBetWatcher] Welcome DM sent to ${username || userId}`);
      sent++;
    } else {
      console.error(`[GameBetWatcher] Welcome DM failed for ${username || userId}:`, result.reason);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  saveLastUserDmCheck(new Date());
}

// ── Settings helpers ───────────────────────────────────────────────────────────

function getRankingsTopN() {
  try {
    const row = getSQLite()
      .prepare("SELECT value FROM admin_settings WHERE key = 'rankings_top_n'")
      .get();
    const n = row ? Number(row.value) : 10;
    return Number.isFinite(n) && n >= 1 ? Math.min(25, n) : 10;
  } catch {
    return 10;
  }
}

function getLargeStakeThreshold() {
  try {
    const row = getSQLite()
      .prepare("SELECT value FROM admin_settings WHERE key = 'large_stake_threshold'")
      .get();
    return row ? Number(row.value) : 7;
  } catch {
    return 7;
  }
}

// ── Vars builder ───────────────────────────────────────────────────────────────

function buildMultiVars(bet, fixtures, creator, currentPlayers) {
  // Accept single fixture object (backward compat) or array
  const fixturesArr  = Array.isArray(fixtures) ? fixtures : [fixtures];
  const fixture      = fixturesArr[0] || {};

  const maxPlayers     = Number(bet.capacity || bet.maxParticipants) || 0;
  const slotsRemaining = Math.max(0, maxPlayers - currentPlayers);
  const fillPercent    = maxPlayers > 0
    ? `${Math.round((currentPlayers / maxPlayers) * 100)}%`
    : '0%';
  const stakeAmt    = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
  const stake       = stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : null;
  // current_pot: gross based on players who have already joined (pre-settlement, no fees yet)
  const currentPot  = stakeAmt != null && currentPlayers > 0
    ? `$${(stakeAmt * currentPlayers).toFixed(2)}`
    : null;
  // potential_pot: gross based on full capacity (hypothetical)
  const potentialPot = stakeAmt != null && maxPlayers > 0
    ? `$${(stakeAmt * maxPlayers).toFixed(2)}`
    : null;

  const fixturesList = fixturesArr
    .map((f) => `• ${f.homeTeam || '—'} vs ${f.awayTeam || '—'}`)
    .join('\n');

  return {
    fixtures_list:   fixturesList     || '—',
    home_team:       fixture.homeTeam  || '—',
    away_team:       fixture.awayTeam  || '—',
    league:          fixture.league    || '—',
    stake:           stake             || '—',
    max_players:     maxPlayers        || '—',
    current_players: currentPlayers,
    slots_remaining: slotsRemaining,
    fill_percent:    fillPercent,
    current_pot:     currentPot        || '—',
    potential_pot:   potentialPot      || '—',
    total_pot:       currentPot        || '—', // backward-compat alias for saved templates
    creator:         creator           || '—',
    code:            bet.bookingCode || bet.title || bet.name || bet._id.toString(),
    mode:            formatMode(bet),
    slots:           maxPlayers        || '—', // backward-compat alias
  };
}

// ── Poll functions ─────────────────────────────────────────────────────────────

async function pollNewBets(db, since) {
  const newBets = await db.collection('game_bet')
    .find({ createdAt: { $gt: since } })
    .sort({ createdAt: 1 })
    .toArray();

  const threshold = getLargeStakeThreshold();

  for (const bet of newBets) {
    const multi = isMultiplayer(bet);
    const [creatorName, fixturesOrFixture] = await Promise.all([
      resolveCreator(db, bet),
      multi ? resolveAllFixtures(db, bet) : resolveFixture(db, bet),
    ]);
    // Normalise: single-bet returns plain object; multi returns array
    const fixture = multi ? fixturesOrFixture[0] || {} : fixturesOrFixture;

    const triggerKey = multi ? 'game_bet_multi_created' : 'game_bet';
    const template   = getTemplate(triggerKey);

    if (template) {
      let vars;
      if (multi) {
        vars = buildMultiVars(bet, fixturesOrFixture, creatorName, getCurrentPlayers(bet));
      } else {
        const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
        vars = {
          code:      bet.bookingCode || bet.title || bet.name || bet._id.toString(),
          creator:   creatorName || '—',
          stake:     stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : '—',
          home_team: fixture.homeTeam || '—',
          away_team: fixture.awayTeam || '—',
          mode:      formatMode(bet),
          slots:     bet.capacity ?? bet.maxParticipants ?? '—',
          league:    fixture.league || '—',
          bet_type:  bet.betType || '—',
          handicap:  bet.optionsCreatedBy != null ? String(bet.optionsCreatedBy) : '',
        };
      }
      const message = renderTemplate(template, vars);
      const result  = multi
        ? await notifyNewMultiBet(db, bet, message, triggerKey)
        : await notifyAll(message, triggerKey);
      if (result.ok) {
        console.log(`[GameBetWatcher] Notified (${triggerKey}): ${vars.code}`);
      } else {
        console.error('[GameBetWatcher] Telegram error:', result);
      }
    }

    // Large stake check for multiplayer bets
    if (multi) {
      const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
      if (stakeAmt != null && stakeAmt > threshold) {
        const largeTemplate = getTemplate('game_bet_large_stake');
        if (largeTemplate) {
          const vars    = buildMultiVars(bet, fixturesOrFixture, creatorName, getCurrentPlayers(bet));
          const message = renderTemplate(largeTemplate, vars);
          const result  = await notifyAll(message, 'game_bet_large_stake');
          if (result.ok) {
            console.log(`[GameBetWatcher] Large stake notified: ${vars.code}`);
          } else {
            console.error('[GameBetWatcher] Large stake Telegram error:', result);
          }
        }
      }
    }
  }
}

async function pollFillProgress(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bets = await db.collection('game_bet')
    .find({
      createdAt: { $gt: thirtyDaysAgo },
      status: { $not: { $regex: /^(FINISHED|SETTLED|COMPLETED|CANCELLED|CANCELED|CLOSED|EXPIRED|DELETED|finished|settled|completed|cancelled|canceled|closed|expired|deleted)$/ } },
    })
    .toArray();

  for (const bet of bets) {
    if (!isMultiplayer(bet)) continue;

    const max = Number(bet.capacity || bet.maxParticipants);
    if (!max || max < 3) continue;

    const currentPlayers = getCurrentPlayers(bet);
    const remaining      = max - currentPlayers;
    const fillRatio      = currentPlayers / max;
    const betId          = bet._id.toString();

    const [creatorName, allFixtures] = await Promise.all([
      resolveCreator(db, bet),
      resolveAllFixtures(db, bet),
    ]);
    const vars = buildMultiVars(bet, allFixtures, creatorName, currentPlayers);

    // 60% fill milestone
    if (fillRatio >= 0.6 && fillRatio < 1 && !hasNotified(betId, 'half')) {
      const template = getTemplate('game_bet_multi_half');
      if (template) {
        const result = await notifyAll(renderTemplate(template, vars), 'game_bet_multi_half');
        if (result.ok) {
          markNotified(betId, 'half');
          console.log(`[GameBetWatcher] Half-fill notified: ${vars.code}`);
        }
      }
    }

    // 3 slots remaining
    if (remaining <= 3 && remaining > 1 && !hasNotified(betId, 'almost_3')) {
      const template = getTemplate('game_bet_multi_almost_3');
      if (template) {
        const result = await notifyAll(renderTemplate(template, vars), 'game_bet_multi_almost_3');
        if (result.ok) {
          markNotified(betId, 'almost_3');
          console.log(`[GameBetWatcher] Almost-3 notified: ${vars.code}`);
        }
      }
    }

    // last slot
    if (remaining === 1 && !hasNotified(betId, 'almost_1')) {
      const template = getTemplate('game_bet_multi_almost_1');
      if (template) {
        const result = await notifyAll(renderTemplate(template, vars), 'game_bet_multi_almost_1');
        if (result.ok) {
          markNotified(betId, 'almost_1');
          console.log(`[GameBetWatcher] Last-slot notified: ${vars.code}`);
        }
      }
    }
  }
}

function buildBetsList(singles, multis, full = false) {
  const singleLines = singles.map(({ vars }) =>
    full
      ? `• ${vars.home_team} vs ${vars.away_team} — Code: ${vars.code} | Kickoff: ${vars.kickoff_time}`
      : `• ${vars.home_team} vs ${vars.away_team} — Code: ${vars.code}`
  );
  const multiLines = multis.map(({ vars }) => {
    const firstLine = (vars.fixtures_list || '').split('\n')[0]?.replace(/^•\s*/, '')
      || `${vars.home_team} vs ${vars.away_team}`;
    const players = `${vars.current_players}/${vars.max_players} players`;
    return full
      ? `• ${firstLine} — ${players} — Code: ${vars.code} | Kickoff: ${vars.kickoff_time}`
      : `• ${firstLine} — ${players} — Code: ${vars.code}`;
  });

  if (singleLines.length > 0 && multiLines.length > 0) {
    return `⚽ Single Bets:\n${singleLines.join('\n')}\n\n🎮 Multiplayer Bets:\n${multiLines.join('\n')}`;
  }
  if (singleLines.length > 0) return singleLines.join('\n');
  return multiLines.join('\n');
}

async function pollCountdowns(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bets = await db.collection('game_bet').find({
    createdAt: { $gt: thirtyDaysAgo },
    status: { $not: { $regex: /^(FINISHED|SETTLED|COMPLETED|CANCELLED|CANCELED|CLOSED|EXPIRED|DELETED|finished|settled|completed|cancelled|canceled|closed|expired|deleted)$/ } },
    gameFixtureId: { $exists: true },
  }).toArray();

  const checkpoints = [
    { key: '1hr',   trigger: 'game_bet_countdown_1hr',   threshold: 65 },
    { key: '30min', trigger: 'game_bet_countdown_30min',  threshold: 35 },
    { key: '15min', trigger: 'game_bet_countdown_15min',  threshold: 20 },
  ];

  // Collect candidates per checkpoint
  const cpGroups = {};
  for (const cp of checkpoints) {
    cpGroups[cp.key] = { broadcast: [], dm: [] };
  }

  for (const bet of bets) {
    const multi = isMultiplayer(bet);
    const betId = bet._id.toString();

    if (multi) {
      const currentPlayers = getCurrentPlayers(bet);
      const maxPlayers = Number(bet.capacity || bet.maxParticipants) || 0;
      if (currentPlayers < 2) continue;
      if (maxPlayers > 0 && currentPlayers >= maxPlayers) continue; // already full

      const allFixtures = await resolveAllFixtures(db, bet);
      const primaryFixture = allFixtures[0] || {};
      if (!primaryFixture.kickoff) continue;
      const kickoffMs = new Date(primaryFixture.kickoff).getTime();
      if (isNaN(kickoffMs)) continue;
      const minutesAway = (kickoffMs - Date.now()) / 60000;

      const needsNotif = checkpoints.some(cp =>
        minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)
      );
      if (!needsNotif) continue;

      const creatorName = await resolveCreator(db, bet);
      const kickoffTime = new Date(kickoffMs).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
      });
      const vars = {
        ...buildMultiVars(bet, allFixtures, creatorName, currentPlayers),
        minutes_until_match: Math.round(minutesAway),
        kickoff_time: kickoffTime,
      };

      for (const cp of checkpoints) {
        if (minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)) {
          cpGroups[cp.key].broadcast.push({ betId, vars, type: 'multi' });
        }
      }
    } else {
      const fixture = await resolveFixture(db, bet);
      if (!fixture.kickoff) continue;
      const kickoffMs = new Date(fixture.kickoff).getTime();
      if (isNaN(kickoffMs)) continue;
      const minutesAway = (kickoffMs - Date.now()) / 60000;

      const needsNotif = checkpoints.some(cp =>
        minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)
      );
      if (!needsNotif) continue;

      const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
      const isJoined = getCurrentPlayers(bet) >= 2 || !!bet.acceptedBy;
      const creatorName = await resolveCreator(db, bet);
      const kickoffTime = new Date(kickoffMs).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
      });
      const vars = {
        home_team:           fixture.homeTeam || '—',
        away_team:           fixture.awayTeam || '—',
        league:              fixture.league   || '—',
        stake:               stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : '—',
        code:                bet.bookingCode || bet.title || bet.name || betId,
        creator:             creatorName || '—',
        kickoff_time:        kickoffTime,
        minutes_until_match: Math.round(minutesAway),
      };

      for (const cp of checkpoints) {
        if (minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)) {
          if (!isJoined) {
            cpGroups[cp.key].broadcast.push({ betId, vars, type: 'single' });
          } else {
            cpGroups[cp.key].dm.push({ betId, bet, vars });
          }
        }
      }
    }
  }

  // Process each checkpoint
  for (const cp of checkpoints) {
    const { broadcast, dm } = cpGroups[cp.key];

    if (broadcast.length > 0) {
      const template = getTemplate(cp.trigger);
      if (template) {
        const singles = broadcast.filter(b => b.type === 'single');
        const multis  = broadcast.filter(b => b.type === 'multi');
        const gVars = {
          count:          broadcast.length,
          bets_list:      buildBetsList(singles, multis, false),
          bets_list_full: buildBetsList(singles, multis, true),
        };
        const result = await notifyAll(renderTemplate(template, gVars), cp.trigger);
        if (result.ok) {
          for (const { betId } of broadcast) markNotified(betId, cp.key);
          console.log(`[GameBetWatcher] ${cp.key} countdown: ${broadcast.length} bets (${singles.length} single, ${multis.length} multi)`);
        }
      }
    }

    // DMs for joined single bets — per-bet plain text (not the grouped format)
    for (const { betId, bet, vars } of dm) {
      const dmText = `⏰ Your Match Kicks Off Soon!\n\n⚽ ${vars.home_team} vs ${vars.away_team}\n🏆 ${vars.league}\n\nKickoff: ${vars.kickoff_time}\nStake: ${vars.stake} | Code: ${vars.code}`;
      const userIds = getParticipantUserIds(bet);
      let anyOk = false;
      let allGaveUp = userIds.length > 0;
      for (const uid of userIds) {
        const dmKey = `cdm_${cp.key}_${uid.slice(-8)}`;
        try {
          const user = await db.collection('users').findOne(
            { _id: new ObjectId(uid) },
            { projection: { mobile: 1 } }
          );
          const phone = user?.mobile;
          if (!phone) { markNotified(betId, dmKey); continue; }
          const dmResult = await sendDirectMessage(phone, dmText, cp.trigger);
          if (dmResult?.ok) {
            anyOk = true;
            markNotified(betId, dmKey);
          } else {
            const giveUp = recordDmFailureAndCheckGiveUp(betId, dmKey);
            if (giveUp) {
              markNotified(betId, dmKey);
              console.warn(`[GameBetWatcher] Giving up countdown DM → ${uid} after ${MAX_DM_AUTO_RETRIES} failures`);
            } else {
              allGaveUp = false;
              console.error(`[GameBetWatcher] DM failed for user ${uid}:`, dmResult.reason);
            }
          }
        } catch (e) {
          allGaveUp = false;
          console.error(`[GameBetWatcher] DM failed for user ${uid}:`, e.message);
        }
      }
      if (anyOk || allGaveUp) {
        markNotified(betId, cp.key);
        console.log(`[GameBetWatcher] Single ${cp.key} countdown (joined, DMs sent): ${vars.code}`);
      }
    }
  }
}

async function pollMatchCountdowns(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bets = await db.collection('game_bet')
    .find({
      createdAt: { $gt: thirtyDaysAgo },
      status: { $not: { $regex: /^(FINISHED|SETTLED|COMPLETED|CANCELLED|CANCELED|CLOSED|EXPIRED|DELETED|finished|settled|completed|cancelled|canceled|closed|expired|deleted)$/ } },
      gameFixtureId: { $exists: true },
    })
    .toArray();

  for (const bet of bets) {
    if (!isMultiplayer(bet)) continue;

    // For multiplayer, require at least 2 players before sending countdown
    const currentPlayers = getCurrentPlayers(bet);
    if (currentPlayers < 2) continue;

    const allFixtures = await resolveAllFixtures(db, bet);
    const primaryFixture = allFixtures[0] || {};
    if (!primaryFixture.kickoff) continue;

    const kickoffMs = new Date(primaryFixture.kickoff).getTime();
    if (isNaN(kickoffMs)) continue;

    const minutesAway = (kickoffMs - Date.now()) / 60000;
    const betId       = bet._id.toString();

    const creatorName = await resolveCreator(db, bet);
    const kickoffTime    = new Date(kickoffMs).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
    });
    const vars = {
      ...buildMultiVars(bet, allFixtures, creatorName, currentPlayers),
      minutes_until_match: Math.round(minutesAway),
      kickoff_time: kickoffTime,
    };

    // Fire each threshold once, as soon as minutesAway drops below it.
    // Grace period of 60 min past kickoff handles server restarts mid-window.
    const checkpoints = [
      { key: '1hr',   trigger: 'game_bet_match_1hr',   threshold: 65 },
      { key: '30min', trigger: 'game_bet_match_30min',  threshold: 35 },
      { key: '15min', trigger: 'game_bet_match_15min',  threshold: 20 },
    ];

    for (const cp of checkpoints) {
      if (minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)) {
        const template = getTemplate(cp.trigger);
        if (template) {
          const result = await notifyAll(renderTemplate(template, vars), cp.trigger);
          if (result.ok) {
            markNotified(betId, cp.key);
            console.log(`[GameBetWatcher] Multi ${cp.key} countdown: ${vars.code}`);
          }
        }
      }
    }
  }
}

async function pollSingleCountdowns(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bets = await db.collection('game_bet').find({
    createdAt: { $gt: thirtyDaysAgo },
    status: { $not: { $regex: /^(FINISHED|SETTLED|COMPLETED|CANCELLED|CANCELED|CLOSED|EXPIRED|DELETED|finished|settled|completed|cancelled|canceled|closed|expired|deleted)$/ } },
    gameFixtureId: { $exists: true },
  }).toArray();

  for (const bet of bets) {
    if (isMultiplayer(bet)) continue; // multiplayer handled by pollMatchCountdowns

    const fixture = await resolveFixture(db, bet);
    if (!fixture.kickoff) continue;

    const kickoffMs = new Date(fixture.kickoff).getTime();
    if (isNaN(kickoffMs)) continue;

    const minutesAway = (kickoffMs - Date.now()) / 60000;
    const betId       = bet._id.toString();
    const creatorName = await resolveCreator(db, bet);
    const kickoffTime = new Date(kickoffMs).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
    });
    const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;

    const vars = {
      home_team:           fixture.homeTeam || '—',
      away_team:           fixture.awayTeam || '—',
      league:              fixture.league   || '—',
      stake:               stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : '—',
      code:                bet.bookingCode || bet.title || bet.name || bet._id.toString(),
      creator:             creatorName || '—',
      kickoff_time:        kickoffTime,
      minutes_until_match: Math.round(minutesAway),
    };

    const checkpoints = [
      { key: '1hr',   trigger: 'game_bet_single_1hr',   threshold: 65 },
      { key: '30min', trigger: 'game_bet_single_30min',  threshold: 35 },
      { key: '15min', trigger: 'game_bet_single_15min',  threshold: 20 },
    ];

    const isJoined = getCurrentPlayers(bet) >= 2 || !!bet.acceptedBy;

    for (const cp of checkpoints) {
      if (minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)) {
        const template = getTemplate(cp.trigger);
        if (!template) continue;

        const message = renderTemplate(template, vars);

        if (!isJoined) {
          // No one has joined yet — broadcast to groups with a join caption
          const broadcastMsg = message + `\n\n🔓 This bet is still open! Join now with code ${vars.code}`;
          const result = await notifyAll(broadcastMsg, cp.trigger);
          if (result.ok) {
            markNotified(betId, cp.key);
            console.log(`[GameBetWatcher] Single ${cp.key} countdown (open): ${vars.code}`);
          }
        } else {
          // Bet has been joined — DM each participant via WhatsApp only (no Telegram DM capability)
          const userIds = getParticipantUserIds(bet);
          let anyOk = false;
          let allGaveUp = userIds.length > 0;
          for (const uid of userIds) {
            const dmKey = `cdm_${cp.key}_${uid.slice(-8)}`;
            try {
              const user = await db.collection('users').findOne(
                { _id: new ObjectId(uid) },
                { projection: { mobile: 1 } }
              );
              const phone = user?.mobile;
              if (!phone) { markNotified(betId, dmKey); continue; }
              const dmResult = await sendDirectMessage(phone, message, cp.trigger);
              if (dmResult?.ok) {
                anyOk = true;
                markNotified(betId, dmKey);
              } else {
                const giveUp = recordDmFailureAndCheckGiveUp(betId, dmKey);
                if (giveUp) {
                  markNotified(betId, dmKey);
                  console.warn(`[GameBetWatcher] Giving up countdown DM → ${uid} after ${MAX_DM_AUTO_RETRIES} failures`);
                } else {
                  allGaveUp = false;
                  console.error(`[GameBetWatcher] DM failed for user ${uid}:`, dmResult.reason);
                }
              }
            } catch (e) {
              allGaveUp = false;
              console.error(`[GameBetWatcher] DM failed for user ${uid}:`, e.message);
            }
          }
          if (anyOk || allGaveUp) {
            markNotified(betId, cp.key);
            console.log(`[GameBetWatcher] Single ${cp.key} countdown (joined, DMs sent): ${vars.code}`);
          }
        }
      }
    }
  }
}

function getParticipantUserIds(bet) {
  if (Array.isArray(bet.participants) && bet.participants.length > 0) {
    return bet.participants
      .map((p) => p.user || p.userId || p._id)
      .filter(Boolean)
      .map(String);
  }
  const ids = [];
  if (bet.createdBy)  ids.push(String(bet.createdBy));
  if (bet.acceptedBy) ids.push(String(bet.acceptedBy));
  return ids;
}

async function buildSettledBaseVars(db, bet) {
  const multi        = isMultiplayer(bet);
  const stakeAmt     = Number(bet.amount) || 0;
  const feeDeducted  = Number(bet.totalFeesDeducted) || 0;
  const playersJoined = multi
    ? (bet.participants?.length || 0)
    : (bet.participants?.length > 0 && bet.acceptedBy ? 2 : bet.participants?.length || 1);

  const grossPot    = stakeAmt * playersJoined;
  const netPot      = grossPot - feeDeducted;
  const winnerPct   = (bet.winnerSplit?.[0] ?? 100) / 100;
  const earnings    = netPot * winnerPct;

  let winnerId = null;
  if (!multi && bet.winnerId) {
    winnerId = bet.winnerId;
  } else if (multi && bet.participants?.length > 0) {
    const sorted = [...bet.participants].sort((a, b) => (b.currentScore ?? 0) - (a.currentScore ?? 0));
    winnerId = sorted[0]?.user;
  }

  const fixture = await resolveFixture(db, bet);

  let winnerName = null;
  try {
    const wUser = await db.collection('users').findOne(
      { _id: toOid(winnerId) },
      { projection: { username: 1, displayName: 1, name: 1 } },
    );
    winnerName = wUser ? (wUser.username || wUser.displayName || wUser.name) : null;
  } catch { /* ignore */ }

  const maxPlayers  = Number(bet.capacity || bet.maxParticipants) || 0;
  const currentPot  = netPot;
  const potentialPot = stakeAmt * maxPlayers;
  const betCode     = bet.bookingCode || bet._id.toString();

  return {
    baseVars: {
      home_team:      fixture.homeTeam || '—',
      away_team:      fixture.awayTeam || '—',
      league:         fixture.league   || '—',
      winner:         winnerName || String(winnerId || '').slice(-6),
      earnings:       `$${earnings.toFixed(2)}`,
      stake:          `$${stakeAmt.toFixed(2)}`,
      current_pot:    `$${currentPot.toFixed(2)}`,
      potential_pot:  `$${potentialPot.toFixed(2)}`,
      total_pot:      `$${currentPot.toFixed(2)}`,
      players_joined: playersJoined,
      max_players:    maxPlayers || '—',
      code:           betCode,
      mode:           formatMode(bet),
    },
    winnerId: winnerId ? String(winnerId) : null,
    betCode,
  };
}

async function pollSettledBets(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bets = await db.collection('game_bet')
    .find({
      createdAt: { $gt: thirtyDaysAgo },
      resolved:  true,
      status:    { $regex: /^(FINISHED|SETTLED|COMPLETED)$/i },
    })
    .toArray();

  for (const bet of bets) {
    const betId = bet._id.toString();
    if (hasNotified(betId, 'settled')) continue;

    const template = getTemplate('game_bet_settled');
    if (!template) { markNotified(betId, 'settled'); continue; }

    const { baseVars, winnerId, betCode } = await buildSettledBaseVars(db, bet);
    if (!winnerId) { markNotified(betId, 'settled'); continue; }

    const participantIds = getParticipantUserIds(bet);
    if (participantIds.length === 0) { markNotified(betId, 'settled'); continue; }

    let allDone = true;
    for (const userId of participantIds) {
      const perKey = 'sdm_' + userId.slice(-10);
      if (hasNotified(betId, perKey)) continue;

      let user = null;
      try {
        user = await db.collection('users').findOne(
          { _id: toOid(userId) },
          { projection: { mobile: 1, username: 1, displayName: 1, name: 1 } },
        );
      } catch { /* ignore */ }

      // No phone — mark done, don't retry
      if (!user?.mobile) { markNotified(betId, perKey); continue; }

      const recipient = user.username || user.displayName || user.name || userId.slice(-6);
      const vars = { ...baseVars, recipient, your_result: userId === winnerId ? 'Won 🏆' : 'Lost' };
      const result = await sendDirectMessage(user.mobile, renderTemplate(template, vars), 'game_bet_settled');

      if (result.ok) {
        markNotified(betId, perKey);
        console.log(`[GameBetWatcher] Settled DM → ${recipient} (${betCode})`);
      } else {
        const giveUp = recordDmFailureAndCheckGiveUp(betId, perKey);
        if (giveUp) {
          markNotified(betId, perKey); // stop retrying
          console.warn(`[GameBetWatcher] Giving up settled DM → ${recipient} after ${MAX_DM_AUTO_RETRIES} failures`);
        } else {
          allDone = false;
          console.error(`[GameBetWatcher] Settled DM failed → ${recipient}:`, result.reason);
        }
      }
    }

    if (allDone) markNotified(betId, 'settled');
  }
}

// ── Rankings notification ──────────────────────────────────────────────────────

const RANK_MEDALS = ['🥇', '🥈', '🥉'];

async function buildRankingsVars(db, period, topN, options = {}) {
  const now = new Date();
  let periodStart = null;
  let periodLabel = '';

  if (options.weekStart) {
    // weekStart is any ISO date — we compute the Monday of that week
    const d = new Date(options.weekStart);
    if (isNaN(d.getTime())) throw new Error(`Invalid weekStart: "${options.weekStart}" — expected YYYY-MM-DD`);
    const day  = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    periodStart = d;
    periodLabel = `Week of ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  } else if (options.monthOf) {
    // monthOf is 'YYYY-MM'
    if (!/^\d{4}-\d{2}$/.test(String(options.monthOf).trim())) {
      throw new Error(`Invalid monthOf: "${options.monthOf}" — expected YYYY-MM (e.g. 2025-04)`);
    }
    const [yr, mo] = options.monthOf.split('-').map(Number);
    periodStart = new Date(yr, mo - 1, 1);
    if (isNaN(periodStart.getTime())) throw new Error(`Invalid monthOf: "${options.monthOf}"`);
    periodLabel = periodStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  } else if (period === 'weekly') {
    const day  = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    periodStart = new Date(now);
    periodStart.setHours(0, 0, 0, 0);
    periodStart.setDate(periodStart.getDate() - diff);
    periodLabel = 'This Week';
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodLabel = 'This Month';
  }

  const matchStage = { $match: {
    resolved: true,
    status:   { $regex: /^(FINISHED|SETTLED|COMPLETED)$/i },
    createdAt: { $gte: periodStart },
  } };

  const rows = await db.collection('game_bet').aggregate([
    matchStage,
    { $unwind: '$participants' },
    { $group: {
      _id:        '$participants.user',
      totalScore: { $sum: { $ifNull: ['$participants.currentScore', 0] } },
      betsCount:  { $sum: 1 },
    }},
    { $sort: { totalScore: -1 } },
    { $limit: topN },
  ]).toArray();

  const countResult = await db.collection('game_bet').aggregate([
    matchStage,
    { $unwind: '$participants' },
    { $group: { _id: '$participants.user' } },
    { $count: 'total' },
  ]).toArray();

  const totalPlayers = countResult[0]?.total || 0;

  const userIds = rows.map((r) => r._id).filter(Boolean);
  const users   = userIds.length
    ? await db.collection('users')
        .find({ _id: { $in: userIds.map(toOid).filter(Boolean) } }, { projection: { username: 1, name: 1 } })
        .toArray()
    : [];
  const userMap = {};
  users.forEach((u) => { userMap[u._id.toString()] = u.username || u.name || u._id.toString(); });

  const lines = rows.map((r, i) => {
    const medal  = RANK_MEDALS[i] || `${i + 1}.`;
    const name   = r._id ? (userMap[String(r._id)] || String(r._id).slice(-6)) : 'Unknown';
    const pts    = r.totalScore.toLocaleString();
    const bets   = r.betsCount;
    return `${medal} ${name} — ${pts} pts (${bets} bet${bets !== 1 ? 's' : ''})`;
  });

  // Compute week range (Monday–Sunday) and month label for the respective macros
  const weekEnd = new Date(periodStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const shortFmt = { day: '2-digit', month: 'short', timeZone: 'Africa/Lagos' };
  const weekLabel = `${periodStart.toLocaleDateString('en-GB', shortFmt)} – ${weekEnd.toLocaleDateString('en-GB', { ...shortFmt, year: 'numeric' })}`;
  const monthLabel = periodStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

  return {
    period:        periodLabel,
    week:          weekLabel,
    month:         monthLabel,
    generated_at:  now.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    top_players:   lines.length ? lines.join('\n') : 'No activity this period',
    total_players: totalPlayers,
  };
}

function getRankingsSentKey(period) {
  return period === 'weekly' ? 'rankings_weekly_sent_at' : 'rankings_monthly_sent_at';
}

function hasRankingsBeenSentThisPeriod(period) {
  try {
    const key = getRankingsSentKey(period);
    const row = getSQLite().prepare('SELECT value FROM admin_settings WHERE key = ?').get(key);
    if (!row?.value) return false;
    const sent = new Date(row.value);
    const now  = new Date();
    if (period === 'weekly') {
      // Same ISO week (Mon–Sun)
      const toMon = (d) => { const m = new Date(d); const day = m.getDay(); m.setDate(m.getDate() - (day === 0 ? 6 : day - 1)); m.setHours(0,0,0,0); return m; };
      return toMon(sent).getTime() === toMon(now).getTime();
    }
    // Monthly: same year+month
    return sent.getFullYear() === now.getFullYear() && sent.getMonth() === now.getMonth();
  } catch {
    return false;
  }
}

function markRankingsSent(period) {
  try {
    const key = getRankingsSentKey(period);
    getSQLite().prepare(`
      INSERT INTO admin_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, new Date().toISOString());
  } catch { /* non-fatal */ }
}

async function pollRankingsNotification(db) {
  const now     = new Date();
  const isMonday = now.getDay() === 1;
  const isFirst  = now.getDate() === 1;

  const toSend = [];
  if (isMonday) toSend.push('weekly');
  if (isFirst)  toSend.push('monthly');

  for (const period of toSend) {
    const trigger = `rankings_${period}`;
    const template = getTemplate(trigger);
    if (!template) continue;
    if (hasRankingsBeenSentThisPeriod(period)) continue;

    try {
      const vars   = await buildRankingsVars(db, period, getRankingsTopN());
      const result = await notifyAll(renderTemplate(template, vars), trigger);
      if (result.ok) {
        markRankingsSent(period);
        console.log(`[GameBetWatcher] Rankings notification sent: ${trigger}`);
      } else {
        console.error(`[GameBetWatcher] Rankings Telegram error (${trigger}):`, result);
      }
    } catch (err) {
      console.error(`[GameBetWatcher] Rankings build error (${trigger}):`, err.message);
    }
  }
}

// ── Watcher entry point ────────────────────────────────────────────────────────

function startWatcher() {
  let lastChecked = readLastChecked();
  console.log(`[GameBetWatcher] Started. New-bet poll every ${NEW_BET_INTERVAL_MS / 1000}s, progress/countdowns every ${POLL_INTERVAL_MS / 1000}s.`);
  console.log(`[GameBetWatcher] Resuming from: ${lastChecked.toISOString()}`);

  watcherState.started   = true;
  watcherState.startedAt = new Date();

  // New bets — fast poll (30 s)
  setInterval(async () => {
    if (!isConfigured() || !isPollEnabled('poll_newbet_enabled')) return;
    try {
      const db    = getDb();
      const since = lastChecked;
      const next  = new Date();
      await pollNewBets(db, since);
      lastChecked = next;
      saveLastChecked(lastChecked);
      watcherState.lastNewBetPoll  = new Date();
      watcherState.newBetPollCount += 1;
    } catch (err) {
      watcherState.lastError   = err.message;
      watcherState.lastErrorAt = new Date();
      console.error('[GameBetWatcher] New-bet poll error:', err.message);
    }
  }, NEW_BET_INTERVAL_MS);

  // Fill progress + countdowns + settled — slow poll (2 min)
  setInterval(async () => {
    if (!isConfigured() || !isPollEnabled('poll_progress_enabled')) return;
    try {
      const db = getDb();
      await Promise.allSettled([
        pollFillProgress(db),
        pollCountdowns(db),
        pollSettledBets(db),
      ]);
      watcherState.lastProgressPoll  = new Date();
      watcherState.progressPollCount += 1;
    } catch (err) {
      watcherState.lastError   = err.message;
      watcherState.lastErrorAt = new Date();
      console.error('[GameBetWatcher] Progress/countdown poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);

  // User welcome DMs — run once on startup then every 5 min
  const runUserDmPoll = async () => {
    try {
      await pollNewUsers(getDb());
      watcherState.lastUserDmPoll  = new Date();
      watcherState.userDmPollCount += 1;
    } catch (err) {
      watcherState.lastError   = err.message;
      watcherState.lastErrorAt = new Date();
      console.error('[GameBetWatcher] User DM poll error:', err.message);
    }
  };
  setTimeout(runUserDmPoll, 5000); // run shortly after startup
  setInterval(runUserDmPoll, USER_DM_INTERVAL_MS);

  // Chatwoot contact sync for new signups — deliberately separate from the
  // welcome-DM poll so it keeps working when WhatsApp DMs are switched off.
  const runChatwootPoll = async () => {
    try {
      await pollChatwootContacts(getDb());
    } catch (err) {
      console.error('[Chatwoot] new-contact poll error:', err.message);
    }
  };
  setTimeout(runChatwootPoll, 20000);
  setInterval(runChatwootPoll, USER_DM_INTERVAL_MS);

  // Daily cleanup + rankings check
  const runDaily = async () => {
    cleanupOldNotified();
    cleanupOldLogs();
    if (isConfigured()) {
      try { await pollRankingsNotification(getDb()); } catch (err) {
        console.error('[GameBetWatcher] Daily rankings error:', err.message);
      }
    }
  };
  runDaily();
  setInterval(runDaily, 24 * 60 * 60 * 1000);
}

module.exports = {
  startWatcher,
  getWatcherState,
  buildRankingsVars,
  getRankingsTopN,
  pollNewUsers,
  getWelcomeConfig,
  hasUserDmSent,
  buildSettledBaseVars,
  getParticipantUserIds,
  // backward compat
  DEFAULT_TEMPLATE,
  GAME_BET_MACROS,
  // new exports
  DEFAULT_TEMPLATES,
  MULTI_BASE_MACROS,
  COUNTDOWN_MACROS,
  LARGE_STAKE_MACROS,
  SINGLE_COUNTDOWN_MACROS,
  GROUPED_COUNTDOWN_MACROS,
  SETTLED_MACROS,
  RANKINGS_MACROS,
  renderTemplate,
  getTemplate,
  resolveTeamName,
  resolveFixture,
  resolveAllFixtures,
  resolveCreator,
  buildMultiVars,
  formatMode,
  isMultiplayer,
  getCurrentPlayers,
  notifyAll,
  notifyAllMedia,
  notifyNewMultiBet,
  toCaption,
};
