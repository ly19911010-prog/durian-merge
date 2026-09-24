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
  floorTop: 712,

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
   */
  geoBaseDiameter: 59.4,
  geoRatio: 1.11,

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
  // bodyFactor = measured max-alpha-extent / 256 (v6.0, natural premium re-render;
  // art normalized to ~86-91% canvas fill) — see note above
  { tier: 1,  tex: 'fruit_01', nameZh: '龙眼',   nameEn: 'Longan',      bodyFactor: 0.886, scoreOnCreate: 10,   color: 0xf5e6c8 },
  { tier: 2,  tex: 'fruit_02', nameZh: '红毛丹', nameEn: 'Rambutan',    bodyFactor: 0.886, scoreOnCreate: 20,   color: 0xff5a5a },
  { tier: 3,  tex: 'fruit_03', nameZh: '青柠',   nameEn: 'Lime',        bodyFactor: 0.886, scoreOnCreate: 40,   color: 0x9be15d },
  { tier: 4,  tex: 'fruit_04', nameZh: '山竹',   nameEn: 'Mangosteen',  bodyFactor: 0.886, scoreOnCreate: 80,   color: 0x9b59b6 },
  { tier: 5,  tex: 'fruit_05', nameZh: '椰子',   nameEn: 'Coconut',     bodyFactor: 0.886, scoreOnCreate: 150,  color: 0xd9c39a },
  { tier: 6,  tex: 'fruit_06', nameZh: '柚子',   nameEn: 'Pomelo',      bodyFactor: 0.886, scoreOnCreate: 250,  color: 0xffe08a },
  { tier: 7,  tex: 'fruit_07', nameZh: '芒果',   nameEn: 'Mango',       bodyFactor: 0.886, scoreOnCreate: 400,  color: 0xffb340 },
  { tier: 8,  tex: 'fruit_08', nameZh: '火龙果', nameEn: 'Dragon Fruit', bodyFactor: 0.886, scoreOnCreate: 650,  color: 0xff4d88 },
  { tier: 9,  tex: 'fruit_09', nameZh: '菠萝',   nameEn: 'Pineapple',   bodyFactor: 0.886, scoreOnCreate: 1000, color: 0xffd23f },
  { tier: 10, tex: 'fruit_10', nameZh: '榴莲',   nameEn: 'Durian',      bodyFactor: 0.886, scoreOnCreate: 1600, color: 0x8bc34a },
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

/** Texture key for a tier. */
export function texForTier(tier: number): string {
  return FRUITS[tier - 1].tex;
}
