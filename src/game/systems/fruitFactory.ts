/** Fruit entity factory — creates physics fruits with consistent visuals/body. */
import Phaser from 'phaser';
import { GAME, texForTier, radiusForTier, bodyFactorForTier } from '../../config/gameConfig';

export type FruitGO = Phaser.Physics.Matter.Image;

export interface FruitOpts {
  isStatic?: boolean;
}

/** Create a live physics fruit at (x, y). */
export function createFruit(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tier: number,
  nowMs: number,
): FruitGO {
  const r = radiusForTier(tier);
  const p = GAME.physics;
  // NOTE: the body is created at the texture's natural half-size (256px for the
  // 512px fruit art), NOT at r. On a Matter Image, setDisplaySize() goes through
  // the Matter Transform scale setters, which scale the physics body by the same
  // factor as the display. Creating the body at 256 means after setDisplaySize(r*2)
  // the body lands at exactly radius r. (Creating it at r directly would shrink
  // the body to r*(2r/512) ≈ 1px, making fruits visually overlap without ever
  // colliding — the "same fruits touch but never merge" bug.)
  //
  // The body is then made to match the DRAWN fruit 1:1 — bodyFactor is the
  // per-tier measured tight-art factor (v3.1, see gameConfig), since the v3.0
  // jelly art only fills 62–88% of its 512px canvas. A factor of 1.0 left a
  // visible gap between touching fruits; matching the art makes neighbours
  // kiss edge-to-edge (× bodyTouchOverlap 0.99 as solver margin): touching
  // fruits kiss with no visual gap, while collision/merge still trigger on
  // the hair-smaller body.
  const img = scene.matter.add.image(x, y, texForTier(tier), undefined, {
    shape: { type: 'circle', radius: 256 * bodyFactorForTier(tier) * GAME.bodyTouchOverlap },
    restitution: p.restitution,
    friction: p.friction,
    frictionStatic: p.frictionStatic,
    frictionAir: p.frictionAir,
    density: 0.0018,
  }) as FruitGO;
  // display size matches physics body; higher tiers look bigger
  img.setDisplaySize(r * 2, r * 2);
  img.setDepth(2);
  // base (undeformed) scale — GameScene.updateRestingSquash() lerps the
  // fruit's scale around this when contacts press on it
  img.setData('baseSX', img.scaleX);
  img.setData('baseSY', img.scaleY);
  // soft blob shadow glued under the fruit — GameScene.updateShadows() syncs
  // its position/scale/alpha every frame (no per-frame allocation)
  const shadow = scene.add.image(x, y + r, 'blob');
  shadow.setDepth(1);
  const shSX = (r * 1.5) / 64;
  const shSY = (r * 0.55) / 32;
  shadow.setScale(shSX, shSY).setAlpha(0.28);
  img.setData('shadow', shadow);
  img.setData('shSX', shSX);
  img.setData('shSY', shSY);
  // jelly gloss: soft top-left specular streak (depth 2.6: above the fruit,
  // below aim guide / particles / float text). GameScene.updateShadows()
  // syncs its position/scale/rotation every frame; counter-rotated so the
  // light holds screen-space top-left while the fruit rolls, and scaled
  // with the resting squash so the highlight deforms with the soft body.
  // v3.0: spiky fruits (T2 rambutan, T10 durian) have no gloss overlay —
  // their spike speculars carry the light; the overlay would look pasted-on.
  if (tier !== 2 && tier !== 10) {
    const gloss = scene.add.image(x - r * 0.3, y - r * 0.36, 'gloss');
    gloss.setDepth(2.6).setAlpha(0.32).setRotation(-0.45);
    const glSX = (r * 1.02) / 128;
    const glSY = (r * 0.58) / 64;
    gloss.setScale(glSX, glSY);
    img.setData('gloss', gloss);
    img.setData('glSX', glSX);
    img.setData('glSY', glSY);
  }
  img.setData('isFruit', true);
  img.setData('tier', tier);
  img.setData('bornAt', nowMs);
  img.setData('merging', false);
  img.setData('dangerSince', 0);
  img.setData('hasLanded', false);
  img.setData('popping', false);
  return img;
}

/** Spawn pop-in tween for a newly merged fruit. */
export function popIn(scene: Phaser.Scene, img: Phaser.GameObjects.Image): void {
  const sx = img.scaleX;
  const sy = img.scaleY;
  img.setData('popping', true);
  img.setScale(sx * 0.55, sy * 0.55);
  scene.tweens.add({
    targets: img,
    scaleX: sx * 1.1,
    scaleY: sy * 1.1,
    duration: 110,
    ease: 'Quad.easeOut',
    yoyo: true,
    onComplete: () => {
      img.setScale(sx, sy);
      img.setData('popping', false);
    },
  });
}
