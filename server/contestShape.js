const { ObjectId } = require('mongodb');

const toOid = (val) => { try { return new ObjectId(String(val)); } catch { return null; } };

// Mirrors participantCountOf in routes/gameBets.js.
function participantCountOf(bet) {
  if (Array.isArray(bet.participants)) return bet.participants.length;
  if (Array.isArray(bet.players)) return bet.players.length;
  if (typeof bet.currentParticipants === 'number') return bet.currentParticipants;
  if (typeof bet.participantCount === 'number') return bet.participantCount;
  return 1;
}

// Build the contest object that WagerDetailsModal expects for a single bet —
// the same shape GET /api/game-bets/open returns per item.
//
// This intentionally duplicates the team/logo resolution in that route rather
// than refactoring it: /open is live and working, and a single-bet lookup is
// cheap enough that sharing the batched implementation isn't worth the risk.
async function buildContestForBet(db, bet) {
  if (!bet) return null;

  let fx = null;
  try {
    const fixtureId = bet.gameFixtureId ? toOid(bet.gameFixtureId) : null;
    if (fixtureId) {
      const f = await db.collection('football_fixtures').findOne({ _id: fixtureId });
      if (f) {
        // Teams are either embedded objects or ObjectId refs into football_teams.
        const refIds = [f.homeTeam, f.awayTeam]
          .filter((t) => t && (typeof t !== 'object' || t instanceof ObjectId))
          .map(toOid)
          .filter(Boolean);

        let teamMap = {};
        if (refIds.length) {
          const teams = await db.collection('football_teams')
            .find({ _id: { $in: refIds } }, { projection: { name: 1, logo: 1 } })
            .toArray();
          teamMap = Object.fromEntries(teams.map((t) => [String(t._id), { name: t.name, logo: t.logo }]));
        }

        const teamName = (val) => {
          if (!val) return null;
          if (typeof val === 'object' && !(val instanceof ObjectId)) return val.name || val.teamName || null;
          return teamMap[String(val)]?.name || null;
        };
        const teamLogo = (val) => {
          if (!val) return null;
          if (typeof val === 'object' && !(val instanceof ObjectId)) return val.logo || val.image || null;
          return teamMap[String(val)]?.logo || null;
        };

        fx = {
          homeTeam: teamName(f.homeTeam) || 'TBD',
          awayTeam: teamName(f.awayTeam) || 'TBD',
          homeLogo: teamLogo(f.homeTeam),
          awayLogo: teamLogo(f.awayTeam),
          date:     f.firstPeriod || f.date || f.fixture?.date || null,
        };
      }
    }
  } catch {
    // Fixture enrichment is best-effort — the card still renders without it.
  }

  const gameDate = fx?.date || bet.possibleStartPeriod || null;

  return {
    id:               bet._id ? String(bet._id) : null,
    bookingCode:      bet.bookingCode || null,
    amount:           bet.amount != null ? Number(bet.amount) : bet.stake != null ? Number(bet.stake) : 0,
    capacity:         Number(bet.capacity || bet.maxParticipants) || 0,
    participantCount: participantCountOf(bet),
    betType:          bet.betType || null,
    betMode:          bet.betMode || null,
    match: {
      homeTeam: fx?.homeTeam || null,
      awayTeam: fx?.awayTeam || null,
      homeLogo: fx?.homeLogo || null,
      awayLogo: fx?.awayLogo || null,
      date:     gameDate,
    },
    firstGame:        gameDate,
    lastGame:         gameDate,
  };
}

module.exports = { buildContestForBet, participantCountOf };
