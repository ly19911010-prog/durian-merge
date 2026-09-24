/** Shared tropical background. */
import Phaser from 'phaser';
import { GAME } from '../../config/gameConfig';

export function drawBackground(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-10);
  // warm gradient sky
  g.fillGradientStyle(0xfff7de, 0xfff7de, 0xffd98f, 0xffd98f, 1, 1, 1, 1);
  g.fillRect(0, 0, GAME.width, GAME.height);
  // gentle sun glow behind the playfield for a softer, warmer center
  g.fillStyle(0xfffbe8, 0.32);
  g.fillCircle(GAME.width / 2, 300, 150);
  g.fillStyle(0xfffbe8, 0.22);
  g.fillCircle(GAME.width / 2, 300, 215);
  // soft decorative blobs
  const blobs: Array<[number, number, number, number]> = [
    [60, 620, 90, 0xffedb8],
    [370, 560, 70, 0xffe3a1],
    [330, 180, 46, 0xd8f3b0],
    [80, 240, 36, 0xd8f3b0],
  ];
  for (const [x, y, r, c] of blobs) {
    g.fillStyle(c, 0.5);
    g.fillCircle(x, y, r);
  }
  // soft ground shadow under the play area for depth
  g.fillGradientStyle(0xe8b96a, 0xe8b96a, 0xd9a44f, 0xd9a44f, 0.35, 0.35, 0.5, 0.5);
  g.fillEllipse(GAME.width / 2, GAME.floorTop + 26, 340, 44);
  // subtle vignette to lift the center
  const vg = scene.add.graphics().setDepth(-9);
  vg.fillGradientStyle(0x8a5a20, 0x8a5a20, 0x8a5a20, 0x8a5a20, 0, 0, 0.12, 0.12);
  vg.fillRect(0, 0, GAME.width, 90);
  vg.fillGradientStyle(0x8a5a20, 0x8a5a20, 0x8a5a20, 0x8a5a20, 0.12, 0.12, 0, 0);
  vg.fillRect(0, GAME.height - 120, GAME.width, 120);
}
