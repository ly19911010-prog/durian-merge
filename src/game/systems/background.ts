/** Shared tropical-dusk background: photo backdrop + drifting light dust + vignette. */
import Phaser from 'phaser';
import { GAME } from '../../config/gameConfig';

export function drawBackground(scene: Phaser.Scene): void {
  // full-bleed dusk photo, cover-fit to the 420x740 playfield
  const bg = scene.add.image(GAME.width / 2, GAME.height / 2, 'bg_dusk');
  bg.setScale(Math.max(GAME.width / bg.width, GAME.height / bg.height));
  bg.setDepth(-10);

  // warm light-dust motes drifting upward (one shared emitter, cheap)
  // NOTE: requires the 'dot' texture generated in BootScene.create()
  const dust = scene.add.particles(0, 0, 'dot', {
    x: { min: 0, max: GAME.width },
    y: { min: 0, max: GAME.height },
    lifespan: { min: 4000, max: 9000 },
    speedY: { min: -14, max: -4 },
    speedX: { min: -6, max: 6 },
    scale: { min: 0.05, max: 0.14 },
    alpha: { start: 0.5, end: 0 },
    tint: [0xffe9a8, 0xffd98f, 0xfff6d8],
    quantity: 1,
    frequency: 900,
  });
  dust.setDepth(-9);

  // NOTE (v2.4): the old 6-stroke edge vignette is gone — its stacked
  // dark-purple bands read as a grey veil over the play area on phones.
  // The dusk photo already frames the scene with palm silhouettes.
}
