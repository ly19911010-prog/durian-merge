/** Shared tropical background. */
import Phaser from 'phaser';
import { GAME } from '../../config/gameConfig';

export function drawBackground(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-10);
  // warm gradient sky
  g.fillGradientStyle(0xfff7de, 0xfff7de, 0xffd98f, 0xffd98f, 1, 1, 1, 1);
  g.fillRect(0, 0, GAME.width, GAME.height);
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
}
