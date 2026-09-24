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
  // The body is then made to match the VISUAL radius 1:1 (bodyFactor 1.0
  // for every tier since v2.4, then × bodyTouchOverlap 0.99 as solver margin):
  // touching fruits kiss edge-to-edge with no visual overlap, while
  // collision/merge still trigger on the hair-smaller body.
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
