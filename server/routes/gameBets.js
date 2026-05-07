const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const toOid = (val) => { try { return new ObjectId(String(val)); } catch { return null; } };
const isOid = (val) => val && (val instanceof ObjectId || (typeof val === 'string' && /^[a-f\d]{24}$/i.test(val)));

// Collect all user-looking IDs from any nested structure
function collectUserIds(obj, depth = 0) {
  if (!obj || depth > 4) return new Set();
  const ids = new Set();
  const userFields = ['user', 'userId', 'player', 'participant', 'member', 'createdBy'];

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (isOid(item)) ids.add(String(item));
      else collectUserIds(item, depth + 1).forEach((id) => ids.add(id));
    });
    return ids;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (userFields.includes(key) && isOid(val)) {
        ids.add(String(val));
      } else if (typeof val === 'object') {
        collectUserIds(val, depth + 1).forEach((id) => ids.add(id));
      }
    }
  }
  return ids;
}

// Collect all fixture-looking IDs
function collectFixtureIds(obj, depth = 0) {
  if (!obj || depth > 4) return new Set();
  const ids = new Set();
  const fixtureFields = ['fixture', 'fixtureId', 'match', 'matchId', 'game'];

  if (Array.isArray(obj)) {
    obj.forEach((item) => collectFixtureIds(item, depth + 1).forEach((id) => ids.add(id)));
    return ids;
  }

  if (typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      if (fixtureFields.includes(key) && isOid(val)) {
        ids.add(String(val));
      } else if (Array.isArray(val) && key === 'fixtures') {
        val.forEach((v) => { if (isOid(v)) ids.add(String(v)); });
      } else if (typeof val === 'object') {
        collectFixtureIds(val, depth + 1).forEach((id) => ids.add(id));
      }
    }
  }
  return ids;
}

// Replace known ObjectIds in a nested structure with display names
function resolveIds(obj, userMap, fixtureMap, depth = 0) {
  if (!obj || depth > 6) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveIds(item, userMap, fixtureMap, depth + 1));
  }

  if (obj instanceof ObjectId) {
    const s = obj.toString();
    return userMap[s] || fixtureMap[s] || s;
  }

  if (typeof obj === 'string' && /^[a-f\d]{24}$/i.test(obj)) {
    return userMap[obj] || fixtureMap[obj] || obj;
  }

  if (typeof obj === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === '_id') { result[key] = val?.toString?.() || val; continue; }
      result[key] = resolveIds(val, userMap, fixtureMap, depth + 1);
    }
    return result;
  }

  return obj;
}

// ── GET /api/game-bets/:id ────────────────────────────────────────────────────

router.get('/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ error: 'Invalid ID' });

    const bet = await db.collection('game_bet').findOne({ _id: oid });
    if (!bet) return res.status(404).json({ error: 'Game bet not found' });

    // Collect all user and fixture IDs found anywhere in the document
    const userIds = collectUserIds(bet);
    const fixtureIds = collectFixtureIds(bet);

    // Also add known top-level user fields
    if (bet.createdBy) userIds.add(String(bet.createdBy));

    // Add fixtures from explicit top-level array
    if (Array.isArray(bet.fixtures)) {
      bet.fixtures.forEach((f) => { if (isOid(f)) fixtureIds.add(String(f)); });
    }

    const [users, fixtures, league, currency] = await Promise.all([
      userIds.size
        ? db.collection('users')
            .find({ _id: { $in: [...userIds].map(toOid).filter(Boolean) } }, { projection: { username: 1, name: 1, email: 1 } })
            .toArray()
        : [],
      fixtureIds.size
        ? db.collection('football_fixtures')
            .find({ _id: { $in: [...fixtureIds].map(toOid).filter(Boolean) } })
            .toArray()
        : [],
      bet.gameLeagueId
        ? db.collection('football_leagues').findOne({ _id: toOid(bet.gameLeagueId) }, { projection: { leagueName: 1, name: 1, image: 1 } })
        : null,
      bet.currencyType
        ? db.collection('currencytypes').findOne({ _id: toOid(bet.currencyType) }, { projection: { name: 1, symbol: 1 } })
        : null,
    ]);

    // Build lookup maps
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u.username || u.name || u.email || u._id.toString(); });

    // Resolve fixture team/league names
    const resolvedFixtures = await Promise.all(
      fixtures.map(async (f) => {
        const getTeamName = async (val) => {
          if (!val) return 'TBD';
          if (val && typeof val === 'object' && !(val instanceof ObjectId)) return val.name || val.teamName || 'Unknown';
          const team = await db.collection('football_teams').findOne({ _id: toOid(val) }, { projection: { name: 1, logo: 1 } });
          return team?.name || String(val);
        };
        const [home, away] = await Promise.all([getTeamName(f.homeTeam), getTeamName(f.awayTeam)]);
        return {
          _id: f._id.toString(),
          homeTeam: home,
          awayTeam: away,
          date: f.firstPeriod || f.date || f.fixture?.date || null,
          status: f.status || f.fixture?.status?.long || null,
        };
      })
    );

    const fixtureMap = {};
    resolvedFixtures.forEach((f) => { fixtureMap[f._id] = `${f.homeTeam} vs ${f.awayTeam}`; });

    // Resolve the full bet document — replace all ObjectIds with display names
    const resolved = resolveIds(bet, userMap, fixtureMap);

    // Extract participant list with resolved names for the UI
    // Try common patterns: participants[], players[], selections grouped by user
    const participantField = ['participants', 'players', 'members', 'entries']
      .find((k) => Array.isArray(bet[k]) && bet[k].length > 0);

    const participants = participantField
      ? bet[participantField].map((entry) => {
          const userId = entry.user || entry.userId || entry.player || entry.participant;
          const username = userId ? (userMap[String(userId)] || String(userId)) : 'Unknown';
          const rawUserId = userId ? String(userId) : null;

          // Find selections/picks — try common field names
          const picks = entry.selections || entry.picks || entry.predictions ||
            entry.choices || entry.bets || entry.answers || null;

          const resolvedPicks = picks
            ? (Array.isArray(picks) ? picks : [picks]).map((pick) => ({
                fixture: pick.fixture || pick.fixtureId || pick.match
                  ? (fixtureMap[String(pick.fixture || pick.fixtureId || pick.match)] || String(pick.fixture || pick.fixtureId || pick.match))
                  : null,
                prediction: pick.prediction || pick.choice || pick.pick || pick.result ||
                  pick.outcome || pick.value || JSON.stringify(pick),
              }))
            : null;

          return { userId: rawUserId, username, picks: resolvedPicks, raw: resolveIds(entry, userMap, fixtureMap) };
        })
      : [];

    res.json({
      _id: bet._id.toString(),
      bookingCode: bet.bookingCode,
      league: league ? { name: league.leagueName || league.name, image: league.image } : null,
      currency: currency || null,
      createdBy: bet.createdBy ? (userMap[String(bet.createdBy)] || String(bet.createdBy)) : null,
      createdAt: bet.createdAt,
      status: bet.status || null,
      fixtures: resolvedFixtures,
      participants,
      participantCount: participants.length,
      raw: resolved,
    });
  } catch (err) {
    console.error('Game bet detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
