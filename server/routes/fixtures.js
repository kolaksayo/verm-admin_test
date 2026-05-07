const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Extract team info whether homeTeam/awayTeam is an embedded object or an ObjectId reference
function extractTeamInfo(val) {
  if (!val) return null;
  // Already an embedded object with name/logo
  if (typeof val === 'object' && !Buffer.isBuffer(val) && !(val instanceof ObjectId)) {
    return {
      isEmbedded: true,
      name: val.name || val.teamName || 'Unknown',
      logo: val.logo || val.image || null,
      id: null,
    };
  }
  // ObjectId or string reference
  try {
    return { isEmbedded: false, id: val.toString(), name: null, logo: null };
  } catch {
    return null;
  }
}

function extractLeagueInfo(val) {
  if (!val) return null;
  if (typeof val === 'object' && !Buffer.isBuffer(val) && !(val instanceof ObjectId)) {
    return {
      isEmbedded: true,
      name: val.name || val.leagueName || 'Unknown',
      image: val.logo || val.image || null,
      id: null,
    };
  }
  try {
    return { isEmbedded: false, id: val.toString(), name: null, image: null };
  } catch {
    return null;
  }
}

function extractScore(f) {
  // Try multiple common schema patterns
  const home =
    f.goals?.home ??
    f.score?.fulltime?.home ??
    f.score?.home ??
    null;
  const away =
    f.goals?.away ??
    f.score?.fulltime?.away ??
    f.score?.away ??
    null;
  return { home, away };
}

function extractDate(f) {
  return f.date || f.fixture?.date || f.matchDate || f.kickoff || null;
}

function extractStatus(f) {
  return {
    long: f.status || f.fixture?.status?.long || f.statusLong || null,
    short: f.fixture?.status?.short || f.statusShort || null,
    elapsed: f.fixture?.status?.elapsed || f.elapsed || null,
  };
}

router.get('/leagues', auth, async (req, res) => {
  try {
    const db = getDb();
    const leagues = await db
      .collection('football_leagues')
      .find({ allowFixture: true }, { projection: { _id: 1, leagueName: 1, name: 1, image: 1 } })
      .toArray();
    res.json(
      leagues.map((l) => ({
        id: l._id.toString(),
        name: l.leagueName || l.name || 'Unknown',
        image: l.image || null,
      }))
    );
  } catch (err) {
    console.error('Fixtures leagues error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const leagueId = req.query.leagueId;

    let query = {};
    if (leagueId) {
      try { query.league = new ObjectId(leagueId); } catch {}
    }

    const total = await db.collection('football_fixtures').countDocuments(query);
    const fixtures = await db
      .collection('football_fixtures')
      .find(query)
      .sort({ date: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Separate embedded objects from reference IDs
    const refTeamIds = new Set();
    const refLeagueIds = new Set();

    fixtures.forEach((f) => {
      const ht = extractTeamInfo(f.homeTeam);
      const at = extractTeamInfo(f.awayTeam);
      const lg = extractLeagueInfo(f.league);
      if (ht && !ht.isEmbedded) refTeamIds.add(ht.id);
      if (at && !at.isEmbedded) refTeamIds.add(at.id);
      if (lg && !lg.isEmbedded) refLeagueIds.add(lg.id);
    });

    const toObjectId = (id) => { try { return new ObjectId(id); } catch { return id; } };

    const [dbTeams, dbLeagues] = await Promise.all([
      refTeamIds.size
        ? db.collection('football_teams')
            .find({ _id: { $in: [...refTeamIds].map(toObjectId) } }, { projection: { name: 1, logo: 1 } })
            .toArray()
        : [],
      refLeagueIds.size
        ? db.collection('football_leagues')
            .find({ _id: { $in: [...refLeagueIds].map(toObjectId) } }, { projection: { leagueName: 1, name: 1, image: 1 } })
            .toArray()
        : [],
    ]);

    const teamMap = {};
    dbTeams.forEach((t) => { teamMap[t._id.toString()] = { name: t.name, logo: t.logo || null }; });
    const leagueMap = {};
    dbLeagues.forEach((l) => { leagueMap[l._id.toString()] = { name: l.leagueName || l.name, image: l.image || null }; });

    const resolved = fixtures.map((f) => {
      const htInfo = extractTeamInfo(f.homeTeam);
      const atInfo = extractTeamInfo(f.awayTeam);
      const lgInfo = extractLeagueInfo(f.league);
      const score = extractScore(f);
      const status = extractStatus(f);

      const resolveTeam = (info) => {
        if (!info) return { name: 'TBD', logo: null };
        if (info.isEmbedded) return { name: info.name, logo: info.logo };
        return teamMap[info.id] || { name: 'Unknown', logo: null };
      };

      const resolveLeague = (info) => {
        if (!info) return null;
        if (info.isEmbedded) return { name: info.name, image: info.image };
        return leagueMap[info.id] || { name: 'Unknown', image: null };
      };

      return {
        _id: f._id.toString(),
        date: extractDate(f),
        statusLong: status.long,
        statusShort: status.short,
        elapsed: status.elapsed,
        homeTeam: resolveTeam(htInfo),
        awayTeam: resolveTeam(atInfo),
        league: resolveLeague(lgInfo),
        scoreHome: score.home,
        scoreAway: score.away,
      };
    });

    res.json({ fixtures: resolved, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Fixtures error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
