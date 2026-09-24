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
   * Per-fruit physics body factor: flesh inscribed-circle radius ÷ texture
   * size, measured from the v13 art (fruits are centered, transparent padding
   * removed). Because each fruit's flesh fills the canvas differently
   * (0.61–0.91), a single global factor can never fit all fruits gap-free.
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

  /** fruit hangs / drops from here */
  aimY: 88,
  /** pointer must release below this y to count as a drop (keeps HUD taps safe) */
  dropMinY: 112,

  dangerLineY: 130,
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
   * tier1 (龙眼) 34px → tier10 (榴莲) 148px; geoRatio ≈ 1.1775, so every
   * adjacent tier is ~18% bigger — the level gap is obvious at a glance.
   */
  geoBaseDiameter: 34,
  geoRatio: (148 / 34) ** (1 / 9),

  /**
   * Body radius = visual radius × this fruit's bodyFactor × this overlap.
   * 0.99 makes the flesh visually kiss on contact (fully gap-free) while
   * collision/merge still trigger on the slightly smaller body.
   */
  bodyTouchOverlap: 0.99,

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
  { tier: 1,  tex: 'fruit_01', nameZh: '龙眼',   nameEn: 'Longan',      bodyFactor: 0.668, scoreOnCreate: 10,   color: 0xf5e6c8 },
  { tier: 2,  tex: 'fruit_02', nameZh: '红毛丹', nameEn: 'Rambutan',    bodyFactor: 0.8965, scoreOnCreate: 20,   color: 0xff5a5a },
  { tier: 3,  tex: 'fruit_03', nameZh: '青柠',   nameEn: 'Lime',        bodyFactor: 0.7656, scoreOnCreate: 40,   color: 0x9be15d },
  { tier: 4,  tex: 'fruit_04', nameZh: '山竹',   nameEn: 'Mangosteen',  bodyFactor: 0.8008,  scoreOnCreate: 80,   color: 0x9b59b6 },
  { tier: 5,  tex: 'fruit_05', nameZh: '椰子',   nameEn: 'Coconut',     bodyFactor: 0.8672, scoreOnCreate: 150,  color: 0xd9c39a },
  { tier: 6,  tex: 'fruit_06', nameZh: '柚子',   nameEn: 'Pomelo',      bodyFactor: 0.8164, scoreOnCreate: 250,  color: 0xffe08a },
  { tier: 7,  tex: 'fruit_07', nameZh: '芒果',   nameEn: 'Mango',       bodyFactor: 0.668, scoreOnCreate: 400,  color: 0xffb340 },
  { tier: 8,  tex: 'fruit_08', nameZh: '火龙果', nameEn: 'Dragon Fruit',bodyFactor: 0.6523, scoreOnCreate: 650,  color: 0xff4d88 },
  { tier: 9,  tex: 'fruit_09', nameZh: '菠萝',   nameEn: 'Pineapple',   bodyFactor: 0.5371, scoreOnCreate: 1000, color: 0xffd23f },
  { tier: 10, tex: 'fruit_10', nameZh: '榴莲',   nameEn: 'Durian',      bodyFactor: 0.7734, scoreOnCreate: 1600, color: 0x8bc34a },
];

export const MAX_TIER = FRUITS.length;

/** Display (physics) radius in px for a tier. */
/** Display (visual) radius in px for a tier: geometric growth, d(i) = geoBaseDiameter × geoRatio^(i-1). */
export function radiusForTier(tier: number): number {
  if (!FRUITS[tier - 1]) throw new Error(`invalid tier ${tier}`);
  return (GAME.geoBaseDiameter / 2) * Math.pow(GAME.geoRatio, tier - 1);
}

/** Physics body factor for a tier (flesh inscribed circle ÷ texture size). */
export function bodyFactorForTier(tier: number): number {
  const def = FRUITS[tier - 1];
  if (!def) throw new Error(`invalid tier ${tier}`);
  return def.bodyFactor;
}

/** Texture key for a tier. */
export function texForTier(tier: number): string {
  return FRUITS[tier - 1].tex;
}
