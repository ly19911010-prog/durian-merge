/** Boot: preload fruit art + generate particle textures, then go to Start. */
import Phaser from 'phaser';
import { GAME } from '../../config/gameConfig';
import { STR } from '../../config/strings';

const FRUIT_FILES: Array<[string, string]> = [
  ['fruit_01', 'assets/fruits/fruit_01_longan.png'],
  ['fruit_02', 'assets/fruits/fruit_02_rambutan.png'],
  ['fruit_03', 'assets/fruits/fruit_03_lime.png'],
  ['fruit_04', 'assets/fruits/fruit_04_mangosteen.png'],
  ['fruit_05', 'assets/fruits/fruit_05_coconut.png'],
  ['fruit_06', 'assets/fruits/fruit_06_pomelo.png'],
  ['fruit_07', 'assets/fruits/fruit_07_mango.png'],
  ['fruit_08', 'assets/fruits/fruit_08_dragonfruit.png'],
  ['fruit_09', 'assets/fruits/fruit_09_pineapple.png'],
  ['fruit_10', 'assets/fruits/fruit_10_durian.png'],
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const label = this.add
      .text(GAME.width / 2, GAME.height / 2, STR.loading, {
        fontSize: '24px',
        color: '#5b3a1e',
      })
      .setOrigin(0.5);
    this.load.on('complete', () => label.destroy());
    for (const [key, path] of FRUIT_FILES) this.load.image(key, path);
  }

  create(): void {
    // soft dot for particle bursts
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    // ring for durian-burst shockwave
    g.clear();
    g.lineStyle(5, 0xffffff, 1);
    g.strokeCircle(32, 32, 27);
    g.generateTexture('ring', 64, 64);
    g.destroy();
    this.scene.start('Start');
  }
}
