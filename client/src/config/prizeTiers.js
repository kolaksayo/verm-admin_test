// Prize-split tiers for contests. Percentages are of the pot and always sum to
// 100. Customer-facing: these are gross prize shares. The platform fee
// (MULTI_BET_FEE) is internal and deliberately never surfaced or implied here.
//
// Valid capacities are 2, 3, and multiples of 5. Capacity 2 is SINGLE mode
// (1v1) and settles down a different path, so it has no multiplayer split.
// Anything else is invalid and must not be shown a projection — inventing a
// split for it would put wrong prize money in front of players.
export const TIERS = {
  3:  [100],
  5:  [70, 30],
  10: [50, 30, 20],
  15: [40, 30, 20, 10],
  20: [35, 25, 20, 10, 10],
};

// Capacity 2 is 1v1: winner takes the pot less a tiered LOCK_BET_FEE, a draw
// refunds both stakes. Not a multiplayer split.
export function isSingleMode(capacity) {
  return Number(capacity) === 2;
}

// Exact lookup — no rounding a capacity up to a neighbouring tier. An unlisted
// capacity returns null so callers can say "unsupported" instead of showing
// numbers that will not match settlement.
export function getSplit(capacity) {
  const cap = Number(capacity);
  return TIERS[cap] ?? null;
}

export function isValidCapacity(capacity) {
  const cap = Number(capacity);
  if (!Number.isInteger(cap)) return false;
  return cap === 2 || cap === 3 || (cap >= 5 && cap % 5 === 0);
}

// Minimum players required for a contest to start = 60% of capacity, rounded
// up, checked at kickoff. e.g. 3 -> 2, 5 -> 3, 10 -> 6, 15 -> 9, 20 -> 12.
// Falling short voids the contest and refunds every stake in full.
export function minPlayersToStart(capacity) {
  return Math.ceil((Number(capacity) || 0) * 0.6);
}

// Prizes per paying position for a given pot and capacity. Full precision —
// callers round for display only. Prizes always sum exactly to the pot.
// Returns [] when no split is defined for the capacity.
export function computePrizes(pot, capacity) {
  const p = Number(pot) || 0;
  const split = getSplit(capacity);
  if (!split) return [];
  return split.map((pct, i) => ({
    position: i + 1,
    amount: p * (pct / 100),
    pct,
  }));
}
