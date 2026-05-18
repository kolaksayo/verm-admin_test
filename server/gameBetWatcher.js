const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { getDb: getSQLite } = require('./sqlite');
const { sendMessage, isConfigured } = require('./telegram');

const POLL_INTERVAL_MS     = 2 * 60 * 1000; // 2 min — fill progress + countdowns + settled
const NEW_BET_INTERVAL_MS  = 30 * 1000;      // 30 sec — new bets only

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

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Players: {{current_players}}/{{max_players}} joined
Stake: {{stake}} per player
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}
Created by: {{creator}}

Open the app to join!`,

  game_bet_multi_half: `⚡ Challenge Halfway There!

⚽ {{home_team}} vs {{away_team}}
{{current_players}}/{{max_players}} players joined ({{fill_percent}} filled)
{{slots_remaining}} slots remaining
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}`,

  game_bet_multi_almost_3: `🔥 Almost Full — 3 Slots Left!

⚽ {{home_team}} vs {{away_team}}
{{current_players}}/{{max_players}} players joined
Stake: {{stake}}
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}`,

  game_bet_multi_almost_1: `🚨 Last Spot Available!

⚽ {{home_team}} vs {{away_team}}
{{current_players}}/{{max_players}} players joined
Stake: {{stake}}
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Code: {{code}}`,

  game_bet_match_1hr: `⏰ Match in 1 Hour!

⚽ {{home_team}} vs {{away_team}}
{{current_players}} players in the challenge
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_match_30min: `⏰ Match Kicks Off in 30 Minutes!

⚽ {{home_team}} vs {{away_team}}
{{current_players}} players ready
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_match_15min: `🚀 Match Starting in 15 Minutes!

⚽ {{home_team}} vs {{away_team}}
{{current_players}} players competing
Current Pot: {{current_pot}} | Potential: {{potential_pot}}
Kickoff: {{kickoff_time}}
Code: {{code}}`,

  game_bet_large_stake: `💰 Large Stake Alert!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

Stake: {{stake}} per player
Current Pot: {{current_pot}} | Potential: {{potential_pot}} ({{max_players}} slots)
Mode: {{mode}} | Code: {{code}}
Creator: {{creator}}`,

  game_bet_settled: `🏆 Challenge Settled!

⚽ {{home_team}} vs {{away_team}}
🏆 {{league}}

🥇 Winner: {{winner}}
💰 Earnings: {{earnings}}

Stake: {{stake}}/player | Players: {{players_joined}}/{{max_players}}
Pot: {{current_pot}} (potential was {{potential_pot}})
Mode: {{mode}} | Code: {{code}}`,
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

const SETTLED_MACROS = [
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

  return {
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
          slots:     bet.capacity ?? bet.maxParticipants ?? '—',
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
      status: { $not: { $regex: /^(FINISHED|SETTLED|COMPLETED|CANCELLED|CANCELED|CLOSED|EXPIRED|DELETED|finished|settled|completed|cancelled|canceled|closed|expired|deleted)$/ } },
      gameFixtureId: { $exists: true },
    })
    .toArray();

  for (const bet of bets) {
    if (!isMultiplayer(bet)) continue;

    // For multiplayer, require at least 2 players before sending countdown
    const currentPlayers = getCurrentPlayers(bet);
    if (currentPlayers < 2) continue;

    const fixture = await resolveFixture(db, bet);
    if (!fixture.kickoff) continue;

    const kickoffMs = new Date(fixture.kickoff).getTime();
    if (isNaN(kickoffMs)) continue;

    const minutesAway = (kickoffMs - Date.now()) / 60000;
    const betId       = bet._id.toString();

    const creatorName = await resolveCreator(db, bet);
    const kickoffTime    = new Date(kickoffMs).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos',
    });
    const vars = {
      ...buildMultiVars(bet, fixture, creatorName, currentPlayers),
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
          const result = await sendMessage(renderTemplate(template, vars), cp.trigger);
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

    for (const cp of checkpoints) {
      if (minutesAway <= cp.threshold && minutesAway > -60 && !hasNotified(betId, cp.key)) {
        const template = getTemplate(cp.trigger);
        if (template) {
          const result = await sendMessage(renderTemplate(template, vars), cp.trigger);
          if (result.ok) {
            markNotified(betId, cp.key);
            console.log(`[GameBetWatcher] Single ${cp.key} countdown: ${vars.code}`);
          }
        }
      }
    }
  }
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

    const multi      = isMultiplayer(bet);
    const stakeAmt   = Number(bet.amount) || 0;
    const feeDeducted = Number(bet.totalFeesDeducted) || 0;

    // Player count: multiplayer uses participants array; single always has 2 (creator + acceptedBy)
    const playersJoined = multi
      ? (bet.participants?.length || 0)
      : (bet.participants?.length > 0 && bet.acceptedBy ? 2 : bet.participants?.length || 1);

    const grossPot     = stakeAmt * playersJoined;
    const netPot       = grossPot - feeDeducted;
    const winnerPct    = (bet.winnerSplit?.[0] ?? 100) / 100;
    const earnings     = netPot * winnerPct;

    // Determine winner:
    // SINGLE → bet.winnerId is the explicit winner field
    // MULTIPLAYER → no winnerId; find participant with highest currentScore
    let winnerId = null;
    if (!multi && bet.winnerId) {
      winnerId = bet.winnerId;
    } else if (multi && bet.participants?.length > 0) {
      const sorted = [...bet.participants].sort((a, b) => (b.currentScore ?? 0) - (a.currentScore ?? 0));
      winnerId = sorted[0]?.user;
    }

    if (!winnerId) { markNotified(betId, 'settled'); continue; }

    const [fixture] = await Promise.all([resolveFixture(db, bet)]);

    let winnerName = null;
    try {
      const wUser = await db.collection('users').findOne(
        { _id: toOid(winnerId) },
        { projection: { username: 1, displayName: 1, name: 1 } },
      );
      winnerName = wUser ? (wUser.username || wUser.displayName || wUser.name) : null;
    } catch { /* ignore */ }

    const maxPlayers   = Number(bet.capacity || bet.maxParticipants) || 0;
    // current_pot: net (fees deducted) — this is the real money being split
    const currentPot   = netPot;
    // potential_pot: gross at full capacity — no fees since hypothetical
    const potentialPot = stakeAmt * maxPlayers;

    const vars = {
      home_team:      fixture.homeTeam || '—',
      away_team:      fixture.awayTeam || '—',
      league:         fixture.league   || '—',
      winner:         winnerName || String(winnerId).slice(-6),
      earnings:       `$${earnings.toFixed(2)}`,
      stake:          `$${stakeAmt.toFixed(2)}`,
      current_pot:    `$${currentPot.toFixed(2)}`,
      potential_pot:  `$${potentialPot.toFixed(2)}`,
      players_joined: playersJoined,
      max_players:    maxPlayers || '—',
      code:           bet.bookingCode || betId,
      mode:           formatMode(bet),
    };

    const result = await sendMessage(renderTemplate(template, vars), 'game_bet_settled');
    if (result.ok) {
      markNotified(betId, 'settled');
      console.log(`[GameBetWatcher] Settled notified: ${vars.code}`);
    }
  }
}

// ── Watcher entry point ────────────────────────────────────────────────────────

function startWatcher() {
  let lastChecked = readLastChecked();
  console.log(`[GameBetWatcher] Started. New-bet poll every ${NEW_BET_INTERVAL_MS / 1000}s, progress/countdowns every ${POLL_INTERVAL_MS / 1000}s.`);
  console.log(`[GameBetWatcher] Resuming from: ${lastChecked.toISOString()}`);

  // New bets — fast poll (30 s)
  setInterval(async () => {
    if (!isConfigured()) return;
    try {
      const db    = getDb();
      const since = lastChecked;
      const next  = new Date();
      await pollNewBets(db, since);
      // Advance only after successful poll so a crash doesn't skip bets
      lastChecked = next;
      saveLastChecked(lastChecked);
    } catch (err) {
      console.error('[GameBetWatcher] New-bet poll error:', err.message);
    }
  }, NEW_BET_INTERVAL_MS);

  // Fill progress + countdowns + settled — slow poll (2 min)
  setInterval(async () => {
    if (!isConfigured()) return;
    try {
      const db = getDb();
      await Promise.allSettled([
        pollFillProgress(db),
        pollSingleCountdowns(db),
        pollMatchCountdowns(db),
        pollSettledBets(db),
      ]);
    } catch (err) {
      console.error('[GameBetWatcher] Progress/countdown poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);

  // Daily cleanup of old rows
  cleanupOldNotified();
  cleanupOldLogs();
  setInterval(() => { cleanupOldNotified(); cleanupOldLogs(); }, 24 * 60 * 60 * 1000);
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
  SINGLE_COUNTDOWN_MACROS,
  SETTLED_MACROS,
  renderTemplate,
  getTemplate,
  resolveTeamName,
};
