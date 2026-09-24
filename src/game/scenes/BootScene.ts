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
    this.load.image('bg_dusk', 'assets/bg/bg_dusk.jpg');
  }

  create(): void {
    // soft dot for particle bursts — generated at 48px so particles stay
    // crisp when the game runs at up to 3x device-pixel zoom (emitter particle
    // scale start was 0.9 for the old 16px dot; 0.3 keeps the same ~14px look)
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(24, 24, 24);
    g.generateTexture('dot', 48, 48);
    // soft blob shadow (64x32): concentric ellipses, largest first, for a
    // gentle falloff — one fruit shadow instance is synced under each fruit
    g.clear();
    for (let i = 0; i < 5; i++) {
      const s = 1 - i * 0.16;
      g.fillStyle(0x4a2c10, 0.1 + i * 0.055);
      g.fillEllipse(32, 16, 60 * s, 28 * s);
    }
    g.generateTexture('blob', 64, 32);
    // ring for durian-burst shockwave — generated at 256px because the
    // shockwave scales it up ~1.6x; the old 64px version upscaled 6.4x and
    // looked blurry (GameScene.shockwave divides by 256 now)
    g.clear();
    g.lineStyle(10, 0xffffff, 1);
    g.strokeCircle(128, 128, 118);
    g.generateTexture('ring', 256, 256);
    g.destroy();
    this.scene.start('Start');
  }
}
