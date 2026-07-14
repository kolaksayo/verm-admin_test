// Prize-split tiers for multiplayer contests. Percentages are of the pot and
// always sum to 100. Only capacities that split across 2+ paying positions
// are represented (multiplayer scope). Customer-facing: these are gross prize
// shares — no fee/commission is ever applied or implied.
export const TIERS = {
  5:  [70, 30],
  10: [50, 30, 20],
  15: [40, 30, 20, 10],
  20: [35, 25, 20, 10, 10],
};

const TIER_CAPS = [5, 10, 15, 20];

// Map an arbitrary capacity to a tier: the smallest tier whose size is >= the
// contest capacity, clamped to the largest tier (20). e.g. 8 -> 10, 20 -> 20,
// 25 -> 20.
export function pickTier(capacity) {
  const cap = Number(capacity) || 0;
  return TIER_CAPS.find((t) => t >= cap) ?? 20;
}

// Minimum players required for a contest to start = 60% of capacity, rounded
// up. e.g. 3 -> 2, 5 -> 3, 10 -> 6, 15 -> 9, 20 -> 12.
export function minPlayersToStart(capacity) {
  return Math.ceil((Number(capacity) || 0) * 0.6);
}

// Prizes per paying position for a given pot and capacity. Full precision —
// callers round for display only. Prizes always sum exactly to the pot.
export function computePrizes(pot, capacity) {
  const p = Number(pot) || 0;
  const split = TIERS[pickTier(capacity)];
  return split.map((pct, i) => ({
    position: i + 1,
    amount: p * (pct / 100),
    pct,
  }));
}
