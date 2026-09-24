/** Start screen: hero durian, juicy title, fruit arrangement, play button. */
import Phaser from 'phaser';
import { GAME, FRUITS } from '../../config/gameConfig';
import { STR } from '../../config/strings';
import { loadBest } from '../../utils/storage';
import { sfx } from '../../audio/sfx';
import { drawBackground } from '../systems/background';
import { makeButton, FONT_FAMILY } from '../systems/ui';

export class StartScene extends Phaser.Scene {
  constructor() {
    super('Start');
  }

  create(): void {
    drawBackground(this);
    const cx = GAME.width / 2;

    // hero durian with gentle bob
    const logo = this.add.image(cx, 196, 'fruit_10').setDisplaySize(150, 150);
    this.tweens.add({
      targets: logo, y: 208, duration: 1400,
      ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    });
    // small fruits posed around the hero
    const side: Array<[string, number, number, number]> = [
      ['fruit_08', cx - 118, 150, 64],
      ['fruit_09', cx + 122, 158, 70],
      ['fruit_03', cx - 96, 262, 52],
      ['fruit_07', cx + 100, 268, 56],
    ];
    for (const [tex, x, y, s] of side) {
      const img = this.add.image(x, y, tex).setDisplaySize(s, s);
      this.tweens.add({
        targets: img, y: y + 8, duration: 1100 + s * 6,
        ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
      });
    }

    this.add
      .text(cx, 330, STR.title, {
        fontFamily: FONT_FAMILY,
        fontSize: '58px',
        color: '#fff8ea',
        stroke: '#7a3c10',
        strokeThickness: 10,
        shadow: { offsetX: 0, offsetY: 4, color: '#4a2408', blur: 0, fill: true },
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 376, STR.subtitle, {
        fontFamily: FONT_FAMILY, fontSize: '18px', color: '#fff3d9',
        stroke: '#7a4a20', strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 428, STR.howTo, {
        fontFamily: FONT_FAMILY, fontSize: '17px', color: '#fff3d9',
        stroke: '#7a4a20', strokeThickness: 4,
        align: 'center', lineSpacing: 6,
      })
      .setOrigin(0.5, 0);

    makeButton(this, cx, 544, 240, 66, STR.play, () => {
      this.scene.start('Game');
    });

    const best = loadBest();
    this.add
      .text(cx, 604, `${STR.bestScore}：${best}`, {
        fontFamily: FONT_FAMILY, fontSize: '23px', color: '#fff8ea',
        stroke: '#7a4a20', strokeThickness: 5,
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
      .text(cx, 700, '龙眼 → 榴莲：合成进化链', {
        fontFamily: FONT_FAMILY, fontSize: '15px', color: '#fff3d9',
        stroke: '#7a4a20', strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.input.once('pointerdown', () => sfx.unlock());
  }
}
