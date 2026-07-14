const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

const toOid = (val) => { try { return new ObjectId(String(val)); } catch { return null; } };

// Only count bets that are fully resolved/completed — exclude open and cancelled bets
const COMPLETED_STATUSES = /^(FINISHED|SETTLED|COMPLETED)$/i;

function getPeriodMatch(period) {
  const now = new Date();
  const base = { resolved: true, status: { $regex: COMPLETED_STATUSES } };
  if (period === 'weekly') {
    const day  = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const mon  = new Date(now);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(mon.getDate() - diff);
    return { ...base, createdAt: { $gte: mon } };
  }
  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { ...base, createdAt: { $gte: start } };
  }
  return base;
}

router.get('/user-rankings', auth, requirePermission('betting', 'user_rankings'), async (req, res) => {
  try {
    const db     = getDb();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const period = ['weekly', 'monthly', 'all'].includes(req.query.period) ? req.query.period : 'all';
    const match      = getPeriodMatch(period);
    const matchStage = [{ $match: match }];

    const pipeline = [
      ...matchStage,
      { $unwind: '$participants' },
      { $group: {
        _id: '$participants.user',
        totalScore:        { $sum: { $ifNull: ['$participants.currentScore', 0] } },
        betsCount:         { $sum: 1 },
        playerPoints:      { $sum: { $ifNull: ['$participants.totalPointPlayer', 0] } },
        timePoints:        { $sum: { $ifNull: ['$participants.totalPointTime', 0] } },
        goalPoints:        { $sum: { $ifNull: ['$participants.totalPlayerGoalPoints', 0] } },
        yellowCardPoints:  { $sum: { $ifNull: ['$participants.totalPlayerYellowCardPoints', 0] } },
      }},
      { $sort: { totalScore: -1 } },
    ];

    const countPipeline = [
      ...matchStage,
      { $unwind: '$participants' },
      { $group: { _id: '$participants.user' } },
      { $count: 'total' },
    ];

    const [allRows, countResult] = await Promise.all([
      db.collection('game_bet').aggregate(pipeline).toArray(),
      db.collection('game_bet').aggregate(countPipeline).toArray(),
    ]);

    const total = countResult[0]?.total || 0;
    const rows = allRows.slice((page - 1) * limit, page * limit);

    const userIds = rows.map((r) => r._id).filter(Boolean);
    const users = userIds.length
      ? await db.collection('users')
          .find({ _id: { $in: userIds.map(toOid).filter(Boolean) } }, { projection: { username: 1, name: 1, email: 1 } })
          .toArray()
      : [];
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u.username || u.name || u.email || u._id.toString(); });

    const rankings = rows.map((r, i) => ({
      rank: (page - 1) * limit + i + 1,
      userId: r._id ? String(r._id) : null,
      username: r._id ? (userMap[String(r._id)] || String(r._id)) : 'Unknown',
      totalScore: r.totalScore,
      betsCount: r.betsCount,
      playerPoints: r.playerPoints,
      timePoints: r.timePoints,
      goalPoints: r.goalPoints,
      yellowCardPoints: r.yellowCardPoints,
      avgScore: r.betsCount > 0 ? Math.round((r.totalScore / r.betsCount) * 10) / 10 : 0,
    }));

    res.json({ rankings, total, page, limit, totalPages: Math.ceil(total / limit), period });
  } catch (err) {
    console.error('User rankings error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard', auth, requirePermission('betting', 'leaderboard'), async (req, res) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    const total = await db.collection('game_bet').countDocuments({});
    const bets = await db.collection('game_bet')
      .find({})
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const userIds = new Set();
    bets.forEach((bet) => {
      (bet.participants || []).forEach((p) => { if (p.user) userIds.add(String(p.user)); });
    });

    const users = userIds.size
      ? await db.collection('users')
          .find({ _id: { $in: [...userIds].map(toOid).filter(Boolean) } }, { projection: { username: 1, name: 1, email: 1 } })
          .toArray()
      : [];
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u.username || u.name || u.email || u._id.toString(); });

    const competitions = bets.map((bet) => {
      const participants = (bet.participants || [])
        .map((p) => {
          const uid = String(p.user);
          return {
            userId: uid,
            username: userMap[uid] || uid,
            isCreator: !!p.creator,
            isWinner: bet.winnerId ? String(bet.winnerId) === uid : false,
            currentScore: p.currentScore ?? null,
          };
        })
        .sort((a, b) => (b.currentScore ?? -Infinity) - (a.currentScore ?? -Infinity));

      let rank = 1;
      participants.forEach((p, i) => {
        if (i > 0 && p.currentScore !== participants[i - 1].currentScore) rank = i + 1;
        p.displayRank = rank;
      });

      return {
        _id: bet._id.toString(),
        bookingCode: bet.bookingCode,
        betType: bet.betType,
        betMode: bet.betMode,
        status: bet.status,
        createdAt: bet.createdAt,
        participants,
      };
    });

    res.json({ competitions, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Game bet leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Terminal statuses — a bet in any of these is no longer joinable.
const TERMINAL_STATUS = /^(FINISHED|SETTLED|COMPLETED|CANCELLED|CANCELED|CLOSED|EXPIRED|DELETED)$/i;

function participantCountOf(bet) {
  if (Array.isArray(bet.participants)) return bet.participants.length;
  if (Array.isArray(bet.players)) return bet.players.length;
  if (typeof bet.currentParticipants === 'number') return bet.currentParticipants;
  if (typeof bet.participantCount === 'number') return bet.participantCount;
  return 1;
}

// GET /api/game-bets/open — open, joinable, not-full multiplayer contests
// (capacity >= 5), enriched with team names + currency for the Prize Projector.
// MUST be declared before '/:id' or Express routes '/open' into that handler.
router.get('/open', auth, requirePermission('betting', 'game_bets'), async (req, res) => {
  try {
    const db = getDb();

    const raw = await db.collection('game_bet')
      .find({ status: { $not: TERMINAL_STATUS }, resolved: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    // Keep only multiplayer (capacity >= 5) contests that still have room.
    const open = raw.filter((bet) => {
      const capacity = Number(bet.capacity || bet.maxParticipants) || 0;
      return capacity >= 5 && participantCountOf(bet) < capacity;
    });

    // ── Batch-resolve fixtures → team names, and currencies ──────────────────
    const fixtureIds = new Set();
    const currencyIds = new Set();
    open.forEach((bet) => {
      if (bet.gameFixtureId) fixtureIds.add(String(bet.gameFixtureId));
      if (bet.currencyType)  currencyIds.add(String(bet.currencyType));
    });

    const [fixtures, currencies] = await Promise.all([
      fixtureIds.size
        ? db.collection('football_fixtures')
            .find({ _id: { $in: [...fixtureIds].map(toOid).filter(Boolean) } })
            .toArray()
        : [],
      currencyIds.size
        ? db.collection('currencytypes')
            .find({ _id: { $in: [...currencyIds].map(toOid).filter(Boolean) } }, { projection: { name: 1, symbol: 1 } })
            .toArray()
        : [],
    ]);

    // Collect team ids from the fixtures, resolve names in one batch.
    const teamIds = new Set();
    fixtures.forEach((f) => {
      [f.homeTeam, f.awayTeam].forEach((t) => {
        if (t && !(typeof t === 'object' && !(t instanceof ObjectId))) teamIds.add(String(t));
      });
    });
    const teams = teamIds.size
      ? await db.collection('football_teams')
          .find({ _id: { $in: [...teamIds].map(toOid).filter(Boolean) } }, { projection: { name: 1 } })
          .toArray()
      : [];
    const teamMap = {};
    teams.forEach((t) => { teamMap[t._id.toString()] = t.name; });

    const teamName = (val) => {
      if (!val) return null;
      if (typeof val === 'object' && !(val instanceof ObjectId)) return val.name || val.teamName || null;
      return teamMap[String(val)] || null;
    };

    const fixtureMap = {};
    fixtures.forEach((f) => {
      fixtureMap[f._id.toString()] = {
        homeTeam: teamName(f.homeTeam) || 'TBD',
        awayTeam: teamName(f.awayTeam) || 'TBD',
        date: f.firstPeriod || f.date || f.fixture?.date || null,
      };
    });

    const currencyMap = {};
    currencies.forEach((c) => { currencyMap[c._id.toString()] = { name: c.name || null, symbol: c.symbol || null }; });

    const items = open.map((bet) => {
      const fx = bet.gameFixtureId ? fixtureMap[String(bet.gameFixtureId)] : null;
      // firstGame/lastGame use the resolved main-fixture date. For multi-fixture
      // (GOALSANDCARDS) bets this is an approximation — true first/last would need
      // per-participant fixture resolution, out of scope for the list endpoint.
      const gameDate = fx?.date || bet.possibleStartPeriod || null;
      return {
        id:               bet._id.toString(),
        bookingCode:      bet.bookingCode || null,
        amount:           bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : 0,
        capacity:         Number(bet.capacity || bet.maxParticipants) || 0,
        participantCount: participantCountOf(bet),
        minParticipants:  Number(bet.minParticipants) || 2,
        betType:          bet.betType || null,
        betMode:          bet.betMode || null,
        currency:         bet.currencyType ? (currencyMap[String(bet.currencyType)] || { name: null, symbol: null }) : { name: null, symbol: null },
        match: {
          homeTeam: fx?.homeTeam || null,
          awayTeam: fx?.awayTeam || null,
          date:     gameDate,
        },
        firstGame:        gameDate,
        lastGame:         gameDate,
        status: bet.status || null,
      };
    });

    // Soonest kickoff first (nulls last), then newest.
    items.sort((a, b) => {
      const da = a.match.date ? new Date(a.match.date).getTime() : Infinity;
      const dbt = b.match.date ? new Date(b.match.date).getTime() : Infinity;
      return da - dbt;
    });

    res.json(items.slice(0, 100));
  } catch (err) {
    console.error('Open game bets error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, requirePermission('betting', 'game_bets'), async (req, res) => {
  try {
    const db = getDb();
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ error: 'Invalid ID' });

    const bet = await db.collection('game_bet').findOne({ _id: oid });
    if (!bet) return res.status(404).json({ error: 'Game bet not found' });

    // ── Collect all IDs to resolve ──────────────────────────────────────────

    const userIds = new Set();
    if (bet.createdBy) userIds.add(String(bet.createdBy));
    if (bet.acceptedBy) userIds.add(String(bet.acceptedBy));
    if (bet.winnerId) userIds.add(String(bet.winnerId));

    const fixtureIds = new Set();
    if (bet.gameFixtureId) fixtureIds.add(String(bet.gameFixtureId));

    (bet.participants || []).forEach((p) => {
      if (p.user) userIds.add(String(p.user));
      (p.fixtures || []).forEach((f) => { if (f.gameFixtureId) fixtureIds.add(String(f.gameFixtureId)); });
      (p.scoreDetails || []).forEach((sd) => { if (sd.fixtureId) fixtureIds.add(String(sd.fixtureId)); });
    });

    // ── Resolve in parallel ─────────────────────────────────────────────────

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

    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = { id: u._id.toString(), username: u.username || u.name || u.email || u._id.toString() }; });

    // Resolve fixture team names
    const getTeamName = async (val) => {
      if (!val) return null;
      if (val && typeof val === 'object' && !(val instanceof ObjectId)) return val.name || val.teamName || null;
      const t = await db.collection('football_teams').findOne({ _id: toOid(val) }, { projection: { name: 1 } });
      return t?.name || null;
    };

    const resolvedFixtures = await Promise.all(
      fixtures.map(async (f) => {
        const [home, away] = await Promise.all([getTeamName(f.homeTeam), getTeamName(f.awayTeam)]);
        return {
          _id: f._id.toString(),
          homeTeam: home || 'TBD',
          awayTeam: away || 'TBD',
          date: f.firstPeriod || f.date || f.fixture?.date || null,
          status: f.status || f.fixture?.status?.long || null,
          scoreHome: f.goals?.home ?? f.score?.fulltime?.home ?? f.score?.home ?? null,
          scoreAway: f.goals?.away ?? f.score?.fulltime?.away ?? f.score?.away ?? null,
        };
      })
    );

    const fixtureMap = {};
    resolvedFixtures.forEach((f) => { fixtureMap[f._id] = f; });

    const winnerUser = bet.winnerId ? (userMap[String(bet.winnerId)] || null) : null;
    const createdByUser = bet.createdBy ? (userMap[String(bet.createdBy)] || null) : null;
    const acceptedByUser = bet.acceptedBy ? (userMap[String(bet.acceptedBy)] || null) : null;

    // ── Build participants ──────────────────────────────────────────────────

    const isGoalsAndCards = bet.betType === 'GOALSANDCARDS';

    const participants = (bet.participants || []).map((p) => {
      const userId = String(p.user);
      const user = userMap[userId] || { id: userId, username: userId };
      const isCreator = !!p.creator;
      const isWinner = bet.winnerId && String(bet.winnerId) === userId;

      // Map scoreDetails by fixtureId for quick lookup
      const scoreByFixture = {};
      (p.scoreDetails || []).forEach((sd) => {
        if (sd.fixtureId) scoreByFixture[String(sd.fixtureId)] = sd;
      });

      // Build per-fixture selection objects
      const fixtureSelections = (p.fixtures || []).map((pf) => {
        const fxId = String(pf.gameFixtureId);
        const fx = fixtureMap[fxId] || null;
        const sd = scoreByFixture[fxId] || null;

        return {
          fixtureId: fxId,
          fixtureLabel: fx ? `${fx.homeTeam} vs ${fx.awayTeam}` : fxId,
          fixtureHome: fx?.homeTeam || null,
          fixtureAway: fx?.awayTeam || null,
          fixtureDate: fx?.date || null,
          status: pf.status || null,
          // Selections
          players: (pf.players || []).map((pl) => ({ id: pl.playerId, name: pl.playerName })),
          times: (pf.time || []),
          // Actual scored events for this fixture
          pointsEarned: sd?.points ?? 0,
          scoredPlayerEvents: (sd?.player || []).map((e) => ({
            player: e.selection,
            event: e.info,
            type: e.type,
            points: e.point,
          })),
          scoredTimeEvents: (sd?.time || []).map((e) => ({
            minute: e.selection,
            event: e.info,
            type: e.type,
            points: e.point,
          })),
        };
      });

      return {
        userId: user.id,
        username: user.username,
        isCreator,
        isWinner,
        currentScore: p.currentScore ?? null,
        totalPointPlayer: p.totalPointPlayer ?? null,
        totalPointTime: p.totalPointTime ?? null,
        totalPlayerGoalPoints: p.totalPlayerGoalPoints ?? null,
        totalPlayerYellowCardPoints: p.totalPlayerYellowCardPoints ?? null,
        totalPlayerRedCardPoints: p.totalPlayerRedCardPoints ?? null,
        // WINNER type: show chosen team
        chosenTeam: !isGoalsAndCards ? (isCreator ? bet.createdByTeam : bet.acceptedByTeam) : null,
        fixtureSelections,
      };
    });

    // Sort participants by score descending so top scorer shows first
    participants.sort((a, b) => (b.currentScore ?? 0) - (a.currentScore ?? 0));

    res.json({
      _id: bet._id.toString(),
      bookingCode: bet.bookingCode,
      betType: bet.betType,
      betMode: bet.betMode,
      gameType: bet.gameType,
      status: bet.status,
      amount: bet.amount,
      totalFeesDeducted: bet.totalFeesDeducted,
      capacity: bet.capacity,
      possibleStartPeriod: bet.possibleStartPeriod,
      createdAt: bet.createdAt,
      resolved: bet.resolved,
      winnerSplit: bet.winnerSplit || null,

      league: league ? { name: league.leagueName || league.name, image: league.image } : null,
      currency,
      mainFixture: bet.gameFixtureId ? (fixtureMap[String(bet.gameFixtureId)] || null) : null,
      scoreline: bet.scoreline ? { home: bet.scoreline.home, away: bet.scoreline.away } : null,

      createdBy: createdByUser,
      acceptedBy: acceptedByUser,
      winner: winnerUser,

      participants,
      participantCount: participants.length,
      allFixtures: resolvedFixtures,
    });
  } catch (err) {
    console.error('Game bet detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
