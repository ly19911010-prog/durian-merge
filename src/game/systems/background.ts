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

  // soft vignette to focus the play area (kept subtle so HUD stays readable)
  const vg = scene.add.graphics().setDepth(50);
  for (let i = 0; i < 6; i++) {
    vg.lineStyle(26, 0x2a1430, 0.04 + (i / 6) * 0.1);
    vg.strokeRect(i * 13, i * 13, GAME.width - i * 26, GAME.height - i * 26);
  }
}
