/**
 * Pure game logic — no Phaser dependency, safe to unit-test in node.
 * All tuning numbers come from gameConfig.
 */
import { GAME, FRUITS, MAX_TIER, radiusForTier } from '../config/gameConfig';

export { radiusForTier };

/**
 * Weighted random pick from the spawn pool (tiers 1..4).
 * @param rand injectable RNG returning [0, 1)
 */
export function pickSpawnTier(rand: () => number): number {
  const tiers = GAME.spawnTiers;
  const weights = GAME.spawnWeights;
  let total = 0;
  for (const w of weights) total += w;
  let r = rand() * total;
  for (let i = 0; i < tiers.length; i++) {
    r -= weights[i];
    if (r < 0) return tiers[i];
  }
  return tiers[tiers.length - 1];
}

/** Score awarded for creating `tier` via merge. 0 for invalid tiers. */
export function mergeScoreForTier(tier: number): number {
  const def = FRUITS[tier - 1];
  return def ? def.scoreOnCreate : 0;
}

export type MergeOutcome =
  | { kind: 'merge'; newTier: number }
  | { kind: 'burst' } // two max-tier fruits collided
  | { kind: 'none' };

/** Resolve what happens when two live fruits of given tiers touch. */
export function resolveMerge(tierA: number, tierB: number): MergeOutcome {
  if (tierA !== tierB) return { kind: 'none' };
  if (tierA < 1 || tierA > MAX_TIER) return { kind: 'none' };
  if (tierA === MAX_TIER) return { kind: 'burst' };
  return { kind: 'merge', newTier: tierA + 1 };
}

/** Clamp a drop x-position so the fruit stays inside the container walls. */
export function clampDropX(x: number, radius: number): number {
  const lo = GAME.innerLeft + radius;
  const hi = GAME.innerRight - radius;
  if (lo > hi) return (GAME.innerLeft + GAME.innerRight) / 2;
  return Math.min(hi, Math.max(lo, x));
}

/** Is a fruit center position above the danger line? */
export function isAboveDangerLine(y: number): boolean {
  return y < GAME.dangerLineY;
}

/** Has a fruit been continuously above the line long enough to end the game? */
export function dangerTimeExceeded(holdStartMs: number, nowMs: number): boolean {
  return nowMs - holdStartMs >= GAME.dangerHoldMs;
}

/** Euclidean distance helper for burst radius checks. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
