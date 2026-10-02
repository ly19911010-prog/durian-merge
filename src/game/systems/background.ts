/** Premium solid gradient background (v6.4): clean champagne-ivory vertical
 * gradient. Replaces the v5.0 tropical-dusk photo per Ly: solid gradients
 * read more premium and keep focus on the fruits. */
import Phaser from 'phaser';
import { GAME } from '../../config/gameConfig';

export function drawBackground(scene: Phaser.Scene): void {
  const bg = scene.add.image(GAME.width / 2, GAME.height / 2, 'bg_gradient');
  bg.setDisplaySize(GAME.width, GAME.height);
  bg.setDepth(-10);
}
