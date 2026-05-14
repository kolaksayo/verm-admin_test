const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { getDb: getSQLite } = require('./sqlite');
const { sendMessage, isConfigured } = require('./telegram');

const POLL_INTERVAL_MS = 2 * 60 * 1000;

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

  game_bet_multi_created: `🎯 New Multiplayer Challenge!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Players: {{current_players}}/{{max_players}} joined
Stake: {{stake}} per player | Pot: {{total_pot}}
Code: {{code}}
Created by: {{creator}}

Open the app to join!`,

  game_bet_multi_half: `⚡ Challenge Halfway There!

⚽ {{home_team}} vs {{away_team}}
{{current_players}}/{{max_players}} players joined ({{fill_percent}} filled)
{{slots_remaining}} slots remaining | Pot: {{total_pot}}
Code: {{code}}`,

  game_bet_multi_almost_3: `🔥 Almost Full — 3 Slots Left!

⚽ {{home_team}} vs {{away_team}}
{{current_players}}/{{max_players}} players joined
Stake: {{stake}} | Pot: {{total_pot}}
Code: {{code}}`,

  game_bet_multi_almost_1: `🚨 Last Spot Available!

⚽ {{home_team}} vs {{away_team}}
{{current_players}}/{{max_players}} players joined
Stake: {{stake}} | Pot: {{total_pot}}
Code: {{code}}`,

  game_bet_match_1hr: `⏰ Match in 1 Hour!

⚽ {{home_team}} vs {{away_team}}
{{current_players}} players in the challenge
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_match_30min: `⏰ Match Kicks Off in 30 Minutes!

⚽ {{home_team}} vs {{away_team}}
{{current_players}} players ready
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_match_15min: `🚀 Match Starting in 15 Minutes!

⚽ {{home_team}} vs {{away_team}}
{{current_players}} players competing
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_large_stake: `💰 Large Stake Alert!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Stake: {{stake}} per player
Pot if full: {{total_pot}} ({{max_players}} slots)
Mode: {{mode}} | Code: {{code}}
Creator: {{creator}}`,
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
];

const MULTI_BASE_MACROS = [
  { key: '{{home_team}}',       desc: 'Home team name' },
  { key: '{{away_team}}',       desc: 'Away team name' },
  { key: '{{league}}',          desc: 'League name' },
  { key: '{{stake}}',           desc: 'Stake per player (e.g. $10.00)' },
  { key: '{{max_players}}',     desc: 'Maximum number of participants' },
  { key: '{{current_players}}', desc: 'Current number of participants' },
  { key: '{{slots_remaining}}', desc: 'Remaining open slots' },
  { key: '{{fill_percent}}',    desc: 'How full the challenge is (e.g. 60%)' },
  { key: '{{total_pot}}',       desc: 'Total pot if all slots filled' },
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
  if (!bet.gameFixtureId) return { homeTeam: null, awayTeam: null, league: null, kickoff: null };
  try {
    const fx = await db.collection('football_fixtures').findOne({ _id: toOid(bet.gameFixtureId) });
    if (!fx) return { homeTeam: null, awayTeam: null, league: null, kickoff: null };
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
    const kickoff = fx.firstPeriod || fx.date || fx.fixture?.date || null;
    return { homeTeam, awayTeam, league, kickoff };
  } catch {
    return { homeTeam: null, awayTeam: null, league: null, kickoff: null };
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
  const slots = Number(bet.maxParticipants);
  if (slots === 2) return 'Head-to-Head';
  if (slots > 2)  return 'Multiplayer';
  return 'Single';
}

function isMultiplayer(bet) {
  const mode = bet.betMode ? String(bet.betMode).toLowerCase() : null;
  if (mode && mode !== 'single') return true;
  const slots = Number(bet.maxParticipants);
  if (slots > 1) return true;
  return false;
}

function getCurrentPlayers(bet) {
  if (Array.isArray(bet.participants)) return bet.participants.length;
  if (Array.isArray(bet.players)) return bet.players.length;
  if (typeof bet.currentParticipants === 'number') return bet.currentParticipants;
  if (typeof bet.participantCount === 'number') return bet.participantCount;
  return 1;
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

// ── Settings helpers ───────────────────────────────────────────────────────────

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

function buildMultiVars(bet, fixture, creator, currentPlayers) {
  const maxPlayers     = Number(bet.maxParticipants) || 0;
  const slotsRemaining = Math.max(0, maxPlayers - currentPlayers);
  const fillPercent    = maxPlayers > 0
    ? `${Math.round((currentPlayers / maxPlayers) * 100)}%`
    : '0%';
  const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
  const stake    = stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : null;
  const totalPot = stakeAmt != null && maxPlayers > 0
    ? `$${(stakeAmt * maxPlayers).toFixed(2)}`
    : null;

  return {
    home_team:       fixture.homeTeam  || '—',
    away_team:       fixture.awayTeam  || '—',
    league:          fixture.league    || '—',
    stake:           stake             || '—',
    max_players:     maxPlayers        || '—',
    current_players: currentPlayers,
    slots_remaining: slotsRemaining,
    fill_percent:    fillPercent,
    total_pot:       totalPot          || '—',
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
    const [creatorName, fixture] = await Promise.all([
      resolveCreator(db, bet),
      resolveFixture(db, bet),
    ]);

    const multi      = isMultiplayer(bet);
    const triggerKey = multi ? 'game_bet_multi_created' : 'game_bet';
    const template   = getTemplate(triggerKey);

    if (template) {
      let vars;
      if (multi) {
        vars = buildMultiVars(bet, fixture, creatorName, getCurrentPlayers(bet));
      } else {
        const stakeAmt = bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : null;
        vars = {
          code:      bet.bookingCode || bet.title || bet.name || bet._id.toString(),
          creator:   creatorName || '—',
          stake:     stakeAmt != null ? `$${stakeAmt.toFixed(2)}` : '—',
          home_team: fixture.homeTeam || '—',
          away_team: fixture.awayTeam || '—',
          mode:      formatMode(bet),
          slots:     bet.maxParticipants ?? '—',
          league:    fixture.league || '—',
        };
      }
      const message = renderTemplate(template, vars);
      const result  = await sendMessage(message, triggerKey);
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
          const vars    = buildMultiVars(bet, fixture, creatorName, getCurrentPlayers(bet));
          const message = renderTemplate(largeTemplate, vars);
          const result  = await sendMessage(message, 'game_bet_large_stake');
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
      status: { $nin: ['settled', 'completed', 'cancelled', 'closed', 'expired'] },
    })
    .toArray();

  for (const bet of bets) {
    if (!isMultiplayer(bet)) continue;

    const max = Number(bet.maxParticipants);
    if (!max || max < 3) continue;

    const currentPlayers = getCurrentPlayers(bet);
    const remaining      = max - currentPlayers;
    const fillRatio      = currentPlayers / max;
    const betId          = bet._id.toString();

    const [creatorName, fixture] = await Promise.all([
      resolveCreator(db, bet),
      resolveFixture(db, bet),
    ]);
    const vars = buildMultiVars(bet, fixture, creatorName, currentPlayers);

    // 60% fill milestone
    if (fillRatio >= 0.6 && fillRatio < 1 && !hasNotified(betId, 'half')) {
      const template = getTemplate('game_bet_multi_half');
      if (template) {
        const result = await sendMessage(renderTemplate(template, vars), 'game_bet_multi_half');
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
        const result = await sendMessage(renderTemplate(template, vars), 'game_bet_multi_almost_3');
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
        const result = await sendMessage(renderTemplate(template, vars), 'game_bet_multi_almost_1');
        if (result.ok) {
          markNotified(betId, 'almost_1');
          console.log(`[GameBetWatcher] Last-slot notified: ${vars.code}`);
        }
      }
    }
  }
}

async function pollMatchCountdowns(db) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const bets = await db.collection('game_bet')
    .find({
      createdAt: { $gt: thirtyDaysAgo },
      status: { $nin: ['settled', 'completed', 'cancelled', 'closed', 'expired'] },
      gameFixtureId: { $exists: true },
    })
    .toArray();

  for (const bet of bets) {
    const currentPlayers = getCurrentPlayers(bet);
    if (currentPlayers < 2) continue;

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
    const vars = {
      ...buildMultiVars(bet, fixture, creatorName, currentPlayers),
      minutes_until_match: Math.round(minutesAway),
      kickoff_time: kickoffTime,
    };

    // 1 hour window: 55–65 min
    if (minutesAway >= 55 && minutesAway <= 65 && !hasNotified(betId, '1hr')) {
      const template = getTemplate('game_bet_match_1hr');
      if (template) {
        const result = await sendMessage(renderTemplate(template, vars), 'game_bet_match_1hr');
        if (result.ok) {
          markNotified(betId, '1hr');
          console.log(`[GameBetWatcher] 1hr countdown notified: ${vars.code}`);
        }
      }
    }

    // 30 min window: 25–35 min
    if (minutesAway >= 25 && minutesAway <= 35 && !hasNotified(betId, '30min')) {
      const template = getTemplate('game_bet_match_30min');
      if (template) {
        const result = await sendMessage(renderTemplate(template, vars), 'game_bet_match_30min');
        if (result.ok) {
          markNotified(betId, '30min');
          console.log(`[GameBetWatcher] 30min countdown notified: ${vars.code}`);
        }
      }
    }

    // 15 min window: 10–20 min
    if (minutesAway >= 10 && minutesAway <= 20 && !hasNotified(betId, '15min')) {
      const template = getTemplate('game_bet_match_15min');
      if (template) {
        const result = await sendMessage(renderTemplate(template, vars), 'game_bet_match_15min');
        if (result.ok) {
          markNotified(betId, '15min');
          console.log(`[GameBetWatcher] 15min countdown notified: ${vars.code}`);
        }
      }
    }
  }
}

// ── Watcher entry point ────────────────────────────────────────────────────────

function startWatcher() {
  let lastChecked = new Date();
  console.log(`[GameBetWatcher] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);

  setInterval(async () => {
    if (!isConfigured()) {
      console.log('[GameBetWatcher] Telegram not configured — skipping poll.');
      return;
    }

    try {
      const db    = getDb();
      const since = lastChecked;
      lastChecked = new Date();

      await Promise.allSettled([
        pollNewBets(db, since),
        pollFillProgress(db),
        pollMatchCountdowns(db),
      ]);
    } catch (err) {
      console.error('[GameBetWatcher] Poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = {
  startWatcher,
  // backward compat
  DEFAULT_TEMPLATE,
  GAME_BET_MACROS,
  // new exports
  DEFAULT_TEMPLATES,
  MULTI_BASE_MACROS,
  COUNTDOWN_MACROS,
  LARGE_STAKE_MACROS,
  renderTemplate,
  getTemplate,
  resolveTeamName,
};
