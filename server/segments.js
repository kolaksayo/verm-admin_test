// Contact segmentation for the CRM push.
//
// Segments are derived from the user document plus a small set of betting
// aggregates, so they are recomputed on every sync rather than stored on the
// user. Thresholds are configurable from the admin UI; the defaults below are
// used when nothing is saved.

const DEFAULT_CONFIG = {
  newSignupDays:   7,     // "new_signup" window
  activeBetDays:   30,    // played within this many days
  dormantDays:     90,    // played once, but not within this many days
  highRollerStake: 1000,  // lifetime stake at or above this (contest currency)
};

// Each segment is a slug plus a predicate over (user, stats, cfg). Keeping them
// declarative means the admin UI can list and preview them without duplicating
// the rules.
const SEGMENT_DEFS = [
  {
    slug: 'new_signup',
    label: 'New signup',
    describe: (c) => `Registered within the last ${c.newSignupDays} days`,
    test: (u, s, c) => withinDays(u.createdAt, c.newSignupDays),
  },
  {
    slug: 'registration_incomplete',
    label: 'Registration incomplete',
    describe: () => 'registrationStage is not COMPLETED',
    test: (u) => u.registrationStage != null && String(u.registrationStage).toUpperCase() !== 'COMPLETED',
  },
  {
    slug: 'email_verified',
    label: 'Email verified',
    describe: () => 'emailVerified is true',
    // Stored as the string "true"/"false" on some accounts, so compare loosely.
    test: (u) => String(u.emailVerified).toLowerCase() === 'true',
  },
  {
    slug: 'email_unverified',
    label: 'Email not verified',
    describe: () => 'Has an email address that is not verified',
    test: (u) => !!u.email && String(u.emailVerified).toLowerCase() !== 'true',
  },
  {
    slug: 'has_naira_account',
    label: 'Has Naira account',
    describe: () => 'A virtual Naira account has been provisioned',
    test: (u) => Array.isArray(u.nairaAccount) && u.nairaAccount.length > 0,
  },
  {
    slug: 'has_crypto_wallet',
    label: 'Has crypto wallet',
    describe: () => 'At least one coin address on file',
    test: (u) => Array.isArray(u.coinAddress) && u.coinAddress.length > 0,
  },
  {
    slug: 'never_played',
    label: 'Never played',
    describe: () => 'Has not joined any wager',
    test: (u, s) => (s?.betCount || 0) === 0,
  },
  {
    slug: 'active_player',
    label: 'Active player',
    describe: (c) => `Joined a wager within the last ${c.activeBetDays} days`,
    test: (u, s, c) => withinDays(s?.lastBetAt, c.activeBetDays),
  },
  {
    slug: 'dormant_player',
    label: 'Dormant player',
    describe: (c) => `Has played, but not within the last ${c.dormantDays} days`,
    test: (u, s, c) => (s?.betCount || 0) > 0 && !withinDays(s?.lastBetAt, c.dormantDays),
  },
  {
    slug: 'high_roller',
    label: 'High roller',
    describe: (c) => `Lifetime stake of ${c.highRollerStake} or more`,
    test: (u, s, c) => (s?.totalStake || 0) >= c.highRollerStake,
  },
  {
    slug: 'contest_creator',
    label: 'Contest creator',
    describe: () => 'Has created at least one wager',
    test: (u, s) => (s?.createdCount || 0) > 0,
  },
];

function withinDays(date, days) {
  if (!date) return false;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - Number(days) * 86400000;
}

function mergeConfig(partial) {
  const cfg = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const v = Number(partial?.[key]);
    if (Number.isFinite(v) && v >= 0) cfg[key] = v;
  }
  return cfg;
}

/** Slugs matching this user. Order follows SEGMENT_DEFS so output is stable. */
function computeSegments(user, stats, config) {
  const cfg = mergeConfig(config);
  return SEGMENT_DEFS.filter((d) => {
    try {
      return !!d.test(user, stats, cfg);
    } catch {
      return false;   // a malformed document must not break the whole sync
    }
  }).map((d) => d.slug);
}

/**
 * Betting aggregates keyed by user id string.
 *
 * One pass over game_bet rather than a query per user — a per-user lookup would
 * be thousands of round trips on a full sync. `userIds` scopes the scan when
 * only part of the book is being synced.
 */
async function buildBetStats(db, userIds = null) {
  const match = {};
  if (Array.isArray(userIds) && userIds.length) {
    match['participants.user'] = { $in: userIds };
  }

  const pipeline = [
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $unwind: '$participants' },
    ...(Array.isArray(userIds) && userIds.length
      ? [{ $match: { 'participants.user': { $in: userIds } } }]
      : []),
    {
      $group: {
        _id: '$participants.user',
        betCount:     { $sum: 1 },
        totalStake:   { $sum: { $ifNull: ['$amount', 0] } },
        lastBetAt:    { $max: '$createdAt' },
        createdCount: { $sum: { $cond: [{ $eq: ['$participants.creator', true] }, 1, 0] } },
      },
    },
  ];

  const rows = await db.collection('game_bet').aggregate(pipeline, { allowDiskUse: true }).toArray();
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), {
      betCount:     r.betCount || 0,
      totalStake:   r.totalStake || 0,
      lastBetAt:    r.lastBetAt || null,
      createdCount: r.createdCount || 0,
    });
  }
  return map;
}

// Slugs only, for validating a requested segment filter.
function allSegmentSlugs() {
  return SEGMENT_DEFS.map((d) => d.slug);
}

// Shape used by the settings UI to explain what each segment means.
function describeSegments(config) {
  const cfg = mergeConfig(config);
  return SEGMENT_DEFS.map((d) => ({
    slug: d.slug,
    label: d.label,
    description: d.describe(cfg),
  }));
}

module.exports = {
  DEFAULT_CONFIG, SEGMENT_DEFS,
  computeSegments, buildBetStats, allSegmentSlugs, describeSegments, mergeConfig,
};
