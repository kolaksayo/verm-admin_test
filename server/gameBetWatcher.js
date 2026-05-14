const { ObjectId } = require('mongodb');
const { getDb } = require('./db');
const { getDb: getSQLite } = require('./sqlite');
const { sendMessage, isConfigured } = require('./telegram');

const POLL_INTERVAL_MS = 2 * 60 * 1000;

const DEFAULT_TEMPLATE = `🎯 New Challenge Created!

⚽ {{home_team}} vs {{away_team}}

Mode: {{mode}}
Code: {{code}}
Created by: {{creator}}
Stake: {{stake}}
Slots: {{slots}}

Open the VermoSports app to join!`;

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

function getTemplate(trigger) {
  try {
    const row = getSQLite()
      .prepare('SELECT template, enabled FROM telegram_templates WHERE trigger = ?')
      .get(trigger);
    if (row && !row.enabled) return null;
    return row?.template || DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

function renderTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v ?? '—'),
    template,
  );
}

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
  if (!bet.gameFixtureId) return { homeTeam: null, awayTeam: null, league: null };
  try {
    const fx = await db.collection('football_fixtures').findOne({ _id: toOid(bet.gameFixtureId) });
    if (!fx) return { homeTeam: null, awayTeam: null, league: null };
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
    return { homeTeam, awayTeam, league };
  } catch {
    return { homeTeam: null, awayTeam: null, league: null };
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
  if (slots > 2)  return `Multiplayer`;
  return 'Single';
}

function startWatcher() {
  let lastChecked = new Date();
  console.log(`[GameBetWatcher] Started. Polling every ${POLL_INTERVAL_MS / 1000}s.`);

  setInterval(async () => {
    if (!isConfigured()) {
      console.log('[GameBetWatcher] Telegram not configured — skipping poll.');
      return;
    }

    const template = getTemplate('game_bet');
    if (!template) return; // trigger disabled

    try {
      const db    = getDb();
      const since = lastChecked;
      lastChecked = new Date();

      const newBets = await db.collection('game_bet')
        .find({ createdAt: { $gt: since } })
        .sort({ createdAt: 1 })
        .toArray();

      for (const bet of newBets) {
        const [creatorName, fixture] = await Promise.all([
          resolveCreator(db, bet),
          resolveFixture(db, bet),
        ]);

        const stake = bet.amount != null
          ? `$${Number(bet.amount).toFixed(2)}`
          : bet.stake != null
            ? `$${Number(bet.stake).toFixed(2)}`
            : null;

        const vars = {
          code:      bet.bookingCode || bet.title || bet.name || bet._id.toString(),
          creator:   creatorName || '—',
          stake:     stake || '—',
          home_team: fixture.homeTeam || '—',
          away_team: fixture.awayTeam || '—',
          mode:      formatMode(bet),
          slots:     bet.maxParticipants ?? '—',
          league:    fixture.league || '—',
        };

        const message = renderTemplate(template, vars);
        const result  = await sendMessage(message, 'game_bet');
        if (result.ok) {
          console.log(`[GameBetWatcher] Notified: ${vars.code}`);
        } else {
          console.error('[GameBetWatcher] Telegram error:', result);
        }
      }
    } catch (err) {
      console.error('[GameBetWatcher] Poll error:', err.message);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = { startWatcher, DEFAULT_TEMPLATE, GAME_BET_MACROS };
