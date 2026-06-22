// Returns a Set<string> of user IDs who have "bet" — i.e. participated in a bet
// (participants.user) OR created one (createdBy). A bet creator is not guaranteed
// to appear in their own participants array, so both sources must be unioned;
// counting participants only undercounts bettors and overcounts "idle depositors".
//
// Pass an optional `matchFilter` (e.g. a createdAt date range) to scope the set
// to a period; omit it for the all-time set.
async function getBettingSet(db, matchFilter) {
  const participantsPipeline = [];
  if (matchFilter) participantsPipeline.push({ $match: matchFilter });
  participantsPipeline.push(
    { $unwind: '$participants' },
    { $group: { _id: '$participants.user' } },
  );

  const [participants, creators] = await Promise.all([
    db.collection('game_bet').aggregate(participantsPipeline).toArray(),
    db.collection('game_bet').distinct('createdBy', matchFilter || {}),
  ]);

  return new Set(
    [
      ...participants.map((b) => String(b._id)),
      ...creators.map(String),
    ].filter((id) => id && id !== 'null' && id !== 'undefined'),
  );
}

module.exports = { getBettingSet };
