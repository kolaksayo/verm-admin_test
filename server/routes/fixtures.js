const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

function isEmbeddedObj(val) {
  return val && typeof val === 'object' && !Buffer.isBuffer(val) && !(val instanceof ObjectId);
}

function extractTeamInfo(val) {
  if (!val) return null;
  if (isEmbeddedObj(val)) {
    return { isEmbedded: true, name: val.name || val.teamName || 'Unknown', logo: val.logo || val.image || null, id: null };
  }
  try { return { isEmbedded: false, id: val.toString(), name: null, logo: null }; } catch { return null; }
}

function extractLeagueInfo(val) {
  if (!val) return null;
  if (isEmbeddedObj(val)) {
    return { isEmbedded: true, name: val.name || val.leagueName || 'Unknown', image: val.logo || val.image || null, id: null };
  }
  try { return { isEmbedded: false, id: val.toString(), name: null, image: null }; } catch { return null; }
}

function extractScore(f) {
  return {
    home: f.goals?.home ?? f.score?.fulltime?.home ?? f.score?.home ?? null,
    away: f.goals?.away ?? f.score?.fulltime?.away ?? f.score?.away ?? null,
  };
}

function extractStatus(f) {
  return {
    long: f.status || f.fixture?.status?.long || f.statusLong || null,
    short: f.fixture?.status?.short || f.statusShort || null,
    elapsed: f.fixture?.status?.elapsed || f.elapsed || null,
  };
}

// ── GET /api/fixtures/leagues ─────────────────────────────────────────────────
// Only leagues that have allowFixture: true

router.get('/leagues', auth, async (req, res) => {
  try {
    const db = getDb();
    const leagues = await db
      .collection('football_leagues')
      .find({ allowFixture: true }, { projection: { _id: 1, leagueName: 1, name: 1, image: 1 } })
      .toArray();

    if (!leagues.length) {
      // Fallback: return all leagues so the UI isn't broken
      const all = await db
        .collection('football_leagues')
        .find({}, { projection: { _id: 1, leagueName: 1, name: 1, image: 1 } })
        .toArray();
      return res.json(all.map((l) => ({ id: l._id.toString(), name: l.leagueName || l.name || 'Unknown', image: l.image || null })));
    }

    res.json(leagues.map((l) => ({ id: l._id.toString(), name: l.leagueName || l.name || 'Unknown', image: l.image || null })));
  } catch (err) {
    console.error('Fixtures leagues error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fixtures ─────────────────────────────────────────────────────────

router.get('/', auth, async (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const leagueId   = req.query.leagueId;
    const leagueName = req.query.leagueName;
    const dateFrom   = req.query.dateFrom;
    const dateTo     = req.query.dateTo;
    const search     = req.query.search?.trim();

    const query = {};

    // League filter — fixtures may store league as:
    //   f.league (embedded obj or ObjectId)  OR  f.gameLeagueId (ObjectId ref, same as game_bet)
    if (leagueId || leagueName) {
      const orClauses = [];

      if (leagueName) {
        const escaped = leagueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRe  = new RegExp(`^${escaped}$`, 'i');
        orClauses.push({ 'league.name':       nameRe });
        orClauses.push({ 'league.leagueName': nameRe });
      }

      if (leagueId) {
        let leagueOid;
        try { leagueOid = new ObjectId(leagueId); } catch {}

        if (leagueOid) {
          // Direct ObjectId field matches (both common field names)
          orClauses.push({ league:        leagueOid });
          orClauses.push({ 'league._id':  leagueOid });
          orClauses.push({ gameLeagueId:  leagueOid });

          // Look up league doc for numeric API id and name
          const leagueDoc = await db.collection('football_leagues').findOne({ _id: leagueOid });
          if (leagueDoc) {
            for (const field of ['id', 'apiId', 'leagueId', 'footballId']) {
              if (leagueDoc[field] != null) {
                orClauses.push({ 'league.id': leagueDoc[field] });
                orClauses.push({ leagueId:    leagueDoc[field] });
              }
            }
            if (!leagueName) {
              const n = leagueDoc.leagueName || leagueDoc.name;
              if (n) {
                const r = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                orClauses.push({ 'league.name':       r });
                orClauses.push({ 'league.leagueName': r });
              }
            }
          }
        }
      }

      if (orClauses.length) query.$or = orClauses;
    }

    // Search by team name (embedded) or fixture _id
    if (search) {
      const searchClauses = [
        { 'homeTeam.name': new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { 'awayTeam.name': new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ];
      try { searchClauses.push({ _id: new ObjectId(search) }); } catch {}
      if (query.$or) {
        // Combine existing league filter with search using $and
        query.$and = [{ $or: query.$or }, { $or: searchClauses }];
        delete query.$or;
      } else {
        query.$or = searchClauses;
      }
    }

    // Date filter using firstPeriod (confirmed field name)
    if (dateFrom || dateTo) {
      query.firstPeriod = {};
      if (dateFrom) {
        query.firstPeriod.$gte = new Date(dateFrom + 'T00:00:00.000Z');
      }
      if (dateTo) {
        query.firstPeriod.$lte = new Date(dateTo + 'T23:59:59.999Z');
      }
    }

    const total = await db.collection('football_fixtures').countDocuments(query);
    const fixtures = await db
      .collection('football_fixtures')
      .find(query)
      .sort({ firstPeriod: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Resolve team/league IDs
    const refTeamIds = new Set();
    const refLeagueIds = new Set();

    fixtures.forEach((f) => {
      const ht = extractTeamInfo(f.homeTeam);
      const at = extractTeamInfo(f.awayTeam);
      const lg = extractLeagueInfo(f.league ?? f.gameLeagueId);
      if (ht && !ht.isEmbedded) refTeamIds.add(ht.id);
      if (at && !at.isEmbedded) refTeamIds.add(at.id);
      if (lg && !lg.isEmbedded) refLeagueIds.add(lg.id);
    });

    const toOid = (id) => { try { return new ObjectId(id); } catch { return id; } };

    const [dbTeams, dbLeagues] = await Promise.all([
      refTeamIds.size
        ? db.collection('football_teams')
            .find({ _id: { $in: [...refTeamIds].map(toOid) } }, { projection: { name: 1, logo: 1 } })
            .toArray()
        : [],
      refLeagueIds.size
        ? db.collection('football_leagues')
            .find({ _id: { $in: [...refLeagueIds].map(toOid) } }, { projection: { leagueName: 1, name: 1, image: 1 } })
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
      const lgInfo = extractLeagueInfo(f.league ?? f.gameLeagueId);
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
        // Use firstPeriod as the match start time, secondPeriod as end time
        date: f.firstPeriod || f.date || f.fixture?.date || null,
        endDate: f.secondPeriod || null,
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
