/**
 * Durian Merge — centralized tuning config.
 * ALL gameplay numbers live here. Nothing gameplay-related should be
 * hardcoded in scenes/systems.
 */

export interface FruitTierDef {
  /** 1-indexed tier */
  tier: number;
  /** Phaser texture key */
  tex: string;
  nameZh: string;
  nameEn: string;
  /**
   * Display radius is NOT per-tier: it grows geometrically across tiers,
   * diameter(i) = GAME.geoBaseDiameter × GAME.geoRatio^(i-1), so the size
   * gap between adjacent tiers is constant and clearly visible.
   */
  /**
   * Per-fruit physics body factor: measured tight-art mean diameter / 512.
   * The v3.0 jelly art only fills 62–88% of its 512px canvas, so a body of
   * 1.0 left a visible gap between touching fruits (with the contact shadow
   * faking the touch). Matching the body to the drawn fruit makes neighbours
   * kiss edge-to-edge; the bbox includes a faint outer glow, so contact lands
   * as a hair of nestling overlap rather than a gap.
   */
  bodyFactor: number;
  /** score awarded when THIS tier is created by a merge */
  scoreOnCreate: number;
  /** particle tint color for merges */
  color: number;
}

export const GAME = {
  width: 420,
  height: 740,

  /** container inner bounds (walls) */
  innerLeft: 14,
  innerRight: 406,
  floorTop: 690,

  /** fruit hangs / drops from here (below the HUD strip) */
  aimY: 77,
  /** pointer must release below this y to count as a drop (keeps HUD taps safe) */
  dropMinY: 60,

  dangerLineY: 134,
  /** fruit must stay continuously above the line this long to end the game */
  dangerHoldMs: 2000,
  /** freshly dropped fruit gets a grace period before danger timing starts */
  dangerGraceMs: 800,

  dropCooldownMs: 600,

  /** spawn pool: tiers + weights (tier >= 5 never spawns) */
  spawnTiers: [1, 2, 3, 4] as number[],
  spawnWeights: [42, 32, 20, 6] as number[],

  /**
   * Fruit display sizes grow geometrically:
   *   diameter(i) = geoBaseDiameter × geoRatio^(i-1)
   * v2.5: geoBaseDiameter = 59.4 (= v2.4's 100 × 0.594). tier10 (durian)
   * lands at ≈ 151.9px diameter — exactly the v2.4 tier5 (coconut) size, per
   * the user's "coconut is the biggest" brief. Full ladder ≈
   * 59/66/73/81/90/100/111/123/137/152px, geoRatio = 1.11 (~11% step).
   * The smaller fruits also let the danger line move back up (134) so the
   * game breathes again at this scale.
   * v6.1: user felt adjacent tiers looked the same size — spread the ladder:
   * geoBaseDiameter = 52, geoRatio = 1.14 (~14% step). Full ladder ≈
   * 52/59/68/77/88/100/114/130/148/169px. Tier 10 stays box-friendly
   * (169px in a 392px-wide box); floorTop moved up 712 → 690 to make room
   * for the bottom evolution bar.
   * v6.5: user wants truly exponential size jumps — geoBaseDiameter = 34,
   * geoRatio = 1.22 (~22% step). Full ladder ≈
   * 34/41/51/62/75/92/112/137/167/204px. Head-to-tail 6.0x (was 3.25x):
   * every merge reads as a real size-up. Tier 10 (204px) still fits the
   * 392px-wide box.
   * v6.5b: t1/t2 still read as same size — push the low end down and steepen:
   * geoBaseDiameter = 28, geoRatio = 1.24 (~24% step). Full ladder ≈
   * 28/35/43/53/66/82/102/126/157/194px. t1 is now distinctly tiny
   * (Suika-cherry-like), t1→t2 jumps 25%. Head-to-tail 6.9x.
   * v6.5c: user says all fruits too small — scale everything up:
   * geoBaseDiameter = 40, geoRatio = 1.20 (~20% step). Full ladder ≈
   * 40/48/58/69/83/100/119/143/172/206px. Head-to-tail 5.2x.
   */
  geoBaseDiameter: 40,
  geoRatio: 1.20,

  /**
   * Body radius = visual radius × this fruit's bodyFactor × this overlap.
   * bodyFactor is the measured tight-art factor per tier (v3.1): the physics
   * circle matches the drawn fruit. Pixel measurement showed ~1.5px of
   * residual gap at body contact (AA edges, non-circular art vs circular
   * body), so the overlap is 0.97: bodies sit 3% inside the art and touching
   * fruits truly kiss (up to a hair of overlap, which reads as soft pressing
   * and pairs with the resting squash). Still plenty of solver margin —
   * contacts are stable and merges trigger on collisionstart as before.
   */
  bodyTouchOverlap: 0.97,

  physics: {
    gravityY: 1,
    restitution: 0.25,
    friction: 0.4,
    frictionStatic: 0.8,
    frictionAir: 0.012,
  },

  /** perf guard */
  maxLiveFruits: 150,

  /** Durian Burst: two tier-10 colliding */
  burst: {
    bonusScore: 3000,
    radius: 170,
    /** removes all live fruits with tier <= this within radius */
    maxTierRemoved: 4,
  },
} as const;

export const FRUITS: FruitTierDef[] = [
  // bodyFactor = measured equator art fill ratio (v6.4): fraction of the 512px
  // texture occupied by fruit art at the equator, where fruits visually touch.
  // Measured 2026-10-02 via alpha scan of each v61 PNG.
  { tier: 1,  tex: 'fruit_01', nameZh: '龙眼',   nameEn: 'Longan',      bodyFactor: 0.857, scoreOnCreate: 10,   color: 0xf5e6c8 },
  { tier: 2,  tex: 'fruit_02', nameZh: '红毛丹', nameEn: 'Rambutan',    bodyFactor: 0.789, scoreOnCreate: 20,   color: 0xff5a5a },
  { tier: 3,  tex: 'fruit_03', nameZh: '青柠',   nameEn: 'Lime',        bodyFactor: 0.684, scoreOnCreate: 40,   color: 0x9be15d },
  { tier: 4,  tex: 'fruit_04', nameZh: '山竹',   nameEn: 'Mangosteen',  bodyFactor: 0.701, scoreOnCreate: 80,   color: 0x9b59b6 },
  { tier: 5,  tex: 'fruit_05', nameZh: '椰子',   nameEn: 'Coconut',     bodyFactor: 0.812, scoreOnCreate: 150,  color: 0xd9c39a },
  { tier: 6,  tex: 'fruit_06', nameZh: '柚子',   nameEn: 'Pomelo',      bodyFactor: 0.820, scoreOnCreate: 250,  color: 0xffe08a },
  { tier: 7,  tex: 'fruit_07', nameZh: '芒果',   nameEn: 'Mango',       bodyFactor: 0.621, scoreOnCreate: 400,  color: 0xffb340 },
  { tier: 8,  tex: 'fruit_08', nameZh: '火龙果', nameEn: 'Dragon Fruit', bodyFactor: 0.586, scoreOnCreate: 650,  color: 0xff4d88 },
  { tier: 9,  tex: 'fruit_09', nameZh: '菠萝',   nameEn: 'Pineapple',   bodyFactor: 0.635, scoreOnCreate: 1000, color: 0xffd23f },
  { tier: 10, tex: 'fruit_10', nameZh: '榴莲',   nameEn: 'Durian',      bodyFactor: 0.742, scoreOnCreate: 1600, color: 0x8bc34a },
];

export const MAX_TIER = FRUITS.length;

/** Display (visual) radius in px for a tier: geometric growth, d(i) = geoBaseDiameter × geoRatio^(i-1). */
export function radiusForTier(tier: number): number {
  if (!FRUITS[tier - 1]) throw new Error(`invalid tier ${tier}`);
  return (GAME.geoBaseDiameter / 2) * Math.pow(GAME.geoRatio, tier - 1);
}

/** Physics body factor for a tier (v2.4: 1.0 for all tiers — body == visual). */
export function bodyFactorForTier(tier: number): number {
  const def = FRUITS[tier - 1];
  if (!def) throw new Error(`invalid tier ${tier}`);
  return def.bodyFactor;
}

/**
 * Per-tier restitution (v6.3, Suika-style "floaty" feel): small fruits are
 * bouncy and lively on drop, big fruits land dead so the pile settles stably.
 * Previously a flat 0.25 for all tiers — the pile felt uniformly dull.
 */
export function restitutionForTier(tier: number): number {
  if (tier <= 0 || tier > MAX_TIER) throw new Error(`invalid tier ${tier}`);
  // v6.4 toned down per Ly ("too much"): 0.45/0.3/0.15 -> 0.32/0.22/0.10
  if (tier <= 3) return 0.32;
  if (tier <= 6) return 0.22;
  return 0.10;
}

/** Texture key for a tier. */
export function texForTier(tier: number): string {
  return FRUITS[tier - 1].tex;
}

/**
 * Per-tier density (v6.3): big fruits are heavier so the pile settles stably
 * and small fruits can't bulldoze them. Base 0.0018, +6% per tier.
 */
export function densityForTier(tier: number): number {
  if (tier <= 0 || tier > MAX_TIER) throw new Error(`invalid tier ${tier}`);
  return 0.0018 * (1 + tier * 0.06);
}
