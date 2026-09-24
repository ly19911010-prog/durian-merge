/** Small UI helpers: buttons with press feedback. */
import Phaser from 'phaser';
import { sfx } from '../../audio/sfx';

export interface ButtonOpts {
  fontSize?: number;
  fill?: number;
  stroke?: number;
  textColor?: string;
  depth?: number;
}

/** Rounded-rect button with press squash + click sound. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const fill = opts.fill ?? 0xff9f2e;
  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 14);
  g.lineStyle(3, opts.stroke ?? 0xd97b12, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
  const txt = scene.add
    .text(0, 0, label, {
      fontSize: `${opts.fontSize ?? 24}px`,
      color: opts.textColor ?? '#5b2a00',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  const c = scene.add.container(x, y, [g, txt]);
  if (opts.depth !== undefined) c.setDepth(opts.depth);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.93));
  c.on('pointerup', () => {
    c.setScale(1);
    sfx.button();
    onClick();
  });
  c.on('pointerout', () => c.setScale(1));
  return c;
}

/** Small icon-style text button (pause / sound). */
export function makeIconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, label, { fontSize: '26px' })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true })
    .setPadding(6, 4, 6, 4);
  t.on('pointerdown', () => t.setScale(0.88));
  t.on('pointerup', () => {
    t.setScale(1);
    sfx.button();
    onClick();
  });
  t.on('pointerout', () => t.setScale(1));
  return t;
}
