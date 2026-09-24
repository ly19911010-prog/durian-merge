/** Start screen: logo placeholder, Play, Best Score, fruit chain preview. */
import Phaser from 'phaser';
import { GAME, FRUITS } from '../../config/gameConfig';
import { STR } from '../../config/strings';
import { loadBest } from '../../utils/storage';
import { sfx } from '../../audio/sfx';
import { drawBackground } from '../systems/background';
import { makeButton } from '../systems/ui';

export class StartScene extends Phaser.Scene {
  constructor() {
    super('Start');
  }

  create(): void {
    drawBackground(this);
    const cx = GAME.width / 2;

    // logo placeholder: big durian with gentle bob
    const logo = this.add.image(cx, 210, 'fruit_10').setDisplaySize(150, 150);
    this.tweens.add({
      targets: logo,
      y: 222,
      duration: 1400,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(cx, 330, STR.title, {
        fontSize: '54px',
        color: '#4a7c2f',
        fontStyle: 'bold',
        stroke: '#ffffff',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 372, STR.subtitle, { fontSize: '17px', color: '#7a5a2e' })
      .setOrigin(0.5);
    this.add
      .text(cx, 428, STR.howTo, {
        fontSize: '16px',
        color: '#8a6a3a',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0);

    makeButton(this, cx, 540, 230, 64, STR.play, () => {
      this.scene.start('Game');
    });

    const best = loadBest();
    this.add
      .text(cx, 600, `${STR.bestScore}：${best}`, {
        fontSize: '22px',
        color: '#5b3a1e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // fruit evolution chain preview
    const startX = 40;
    const step = (GAME.width - 80) / (FRUITS.length - 1);
    FRUITS.forEach((f, i) => {
      const img = this.add
        .image(startX + step * i, 668, f.tex)
        .setDisplaySize(30, 30)
        .setAlpha(0.95);
      img.setData('tier', f.tier);
    });
    this.add
      .text(cx, 700, '龙眼 → 榴莲：合成进化链', { fontSize: '14px', color: '#8a6a3a' })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => sfx.unlock());
  }
}
