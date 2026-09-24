/** Fruit entity factory — creates physics fruits with consistent visuals/body. */
import Phaser from 'phaser';
import { GAME, texForTier, radiusForTier } from '../../config/gameConfig';

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
  const img = scene.matter.add.image(x, y, texForTier(tier), undefined, {
    shape: { type: 'circle', radius: 256 },
    restitution: p.restitution,
    friction: p.friction,
    frictionStatic: p.frictionStatic,
    frictionAir: p.frictionAir,
    density: 0.0012 + tier * 0.00035,
  }) as FruitGO;
  // display size matches physics body; higher tiers look bigger
  img.setDisplaySize(r * 2, r * 2);
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
