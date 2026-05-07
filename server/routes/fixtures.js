const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

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

    const teamIds = new Set();
    const leagueIds = new Set();
    fixtures.forEach((f) => {
      if (f.homeTeam) teamIds.add(f.homeTeam.toString());
      if (f.awayTeam) teamIds.add(f.awayTeam.toString());
      if (f.league) leagueIds.add(f.league.toString());
    });

    const toObjectId = (id) => { try { return new ObjectId(id); } catch { return id; } };

    const [teams, leagues] = await Promise.all([
      teamIds.size
        ? db.collection('football_teams')
            .find({ _id: { $in: [...teamIds].map(toObjectId) } }, { projection: { name: 1, logo: 1 } })
            .toArray()
        : [],
      leagueIds.size
        ? db.collection('football_leagues')
            .find({ _id: { $in: [...leagueIds].map(toObjectId) } }, { projection: { leagueName: 1, name: 1, image: 1 } })
            .toArray()
        : [],
    ]);

    const teamMap = {};
    teams.forEach((t) => { teamMap[t._id.toString()] = { name: t.name, logo: t.logo || null }; });
    const leagueMap = {};
    leagues.forEach((l) => { leagueMap[l._id.toString()] = { name: l.leagueName || l.name, image: l.image || null }; });

    const resolved = fixtures.map((f) => ({
      _id: f._id.toString(),
      date: f.date || f.fixture?.date || null,
      statusLong: f.status || f.fixture?.status?.long || null,
      statusShort: f.fixture?.status?.short || null,
      elapsed: f.fixture?.status?.elapsed || null,
      homeTeam: f.homeTeam ? (teamMap[f.homeTeam.toString()] || { name: String(f.homeTeam) }) : { name: 'TBD' },
      awayTeam: f.awayTeam ? (teamMap[f.awayTeam.toString()] || { name: String(f.awayTeam) }) : { name: 'TBD' },
      league: f.league ? (leagueMap[f.league.toString()] || { name: String(f.league) }) : null,
      scoreHome: f.score?.home ?? f.goals?.home ?? null,
      scoreAway: f.score?.away ?? f.goals?.away ?? null,
    }));

    res.json({ fixtures: resolved, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Fixtures error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
