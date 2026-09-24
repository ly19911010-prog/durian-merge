/** Small UI helpers: glossy juice-style buttons with press feedback. */
import Phaser from 'phaser';
import { sfx } from '../../audio/sfx';

export const FONT_FAMILY =
  '"ZCOOL KuaiLe","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

export interface ButtonOpts {
  fontSize?: number;
  fill?: number;
  stroke?: number;
  textColor?: string;
  depth?: number;
}

/** Darken a 0xRRGGBB color by a 0..1 factor. */
function shade(color: number, f: number): number {
  const c = Phaser.Display.Color.ValueToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red * f),
    Math.round(c.green * f),
    Math.round(c.blue * f),
  );
}

/** Glossy rounded-rect button: drop shadow, vertical gradient, top gloss
 *  highlight, press squash + click sound. */
export function makeButton(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const fill = opts.fill ?? 0xff9f2e;
  const dark = shade(fill, 0.72);
  const edge = opts.stroke ?? shade(fill, 0.55);
  const r = Math.min(18, h / 2 - 2);
  const g = scene.add.graphics();
  // drop shadow
  g.fillStyle(0x3a1c00, 0.22);
  g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r);
  // base
  g.fillStyle(dark, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  // main face (slightly inset, lighter)
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r - 2);
  // top gloss highlight
  g.fillStyle(0xffffff, 0.28);
  g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, (h - 10) * 0.42, r / 2);
  // rim
  g.lineStyle(3, edge, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  const txt = scene.add
    .text(0, 1, label, {
      fontFamily: FONT_FAMILY,
      fontSize: `${opts.fontSize ?? 26}px`,
      color: opts.textColor ?? '#5b2a00',
      stroke: 'rgba(255,255,255,0.65)',
      strokeThickness: 3,
    })
    .setOrigin(0.5);
  const c = scene.add.container(x, y, [g, txt]);
  if (opts.depth !== undefined) c.setDepth(opts.depth);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => c.setScale(0.92));
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
