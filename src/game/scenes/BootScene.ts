/** Boot: preload fruit art + generate particle textures, then go to Start. */
import Phaser from 'phaser';
import { GAME } from '../../config/gameConfig';
import { STR } from '../../config/strings';
import { makeText } from '../systems/ui';

// v4.0: _v40 files are the premium re-render (AI-generated glossy 3D-style
// art replacing the v3.0 jelly gradients) — renamed for cache-busting
// (phone browsers cached the old URLs).
const FRUIT_FILES: Array<[string, string]> = [
  ['fruit_01', 'assets/fruits/fruit_01_v60.png'],
  ['fruit_02', 'assets/fruits/fruit_02_v60.png'],
  ['fruit_03', 'assets/fruits/fruit_03_v60.png'],
  ['fruit_04', 'assets/fruits/fruit_04_v60.png'],
  ['fruit_05', 'assets/fruits/fruit_05_v60.png'],
  ['fruit_06', 'assets/fruits/fruit_06_v60.png'],
  ['fruit_07', 'assets/fruits/fruit_07_v60.png'],
  ['fruit_08', 'assets/fruits/fruit_08_v60.png'],
  ['fruit_09', 'assets/fruits/fruit_09_v60.png'],
  ['fruit_10', 'assets/fruits/fruit_10_v60.png'],
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const label = makeText(this, GAME.width / 2, GAME.height / 2, STR.loading, {
      fontSize: '24px',
      color: '#5b3a1e',
    }).setOrigin(0.5);
    this.load.on('complete', () => label.destroy());
    for (const [key, path] of FRUIT_FILES) this.load.image(key, path);
    this.load.image('bg_dusk', 'assets/bg/bg_dusk_v50.png');
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
    // jelly gloss (128x64): soft white specular streak stamped top-left of
    // every fruit — the cheapest 3D cue. GameScene syncs one instance per
    // fruit every frame (counter-rotated so the light stays top-left in
    // screen space while the fruit rolls). Layered alphas give a soft
    // falloff; the sprite itself runs at alpha ~0.32.
    g.clear();
    for (let i = 0; i < 7; i++) {
      const s = 1 - i * 0.12;
      g.fillStyle(0xffffff, 0.18);
      g.fillEllipse(64, 32, 122 * s, 58 * s);
    }
    g.generateTexture('gloss', 128, 64);
    // bounce light (128x64): warm under-glow stamped at the bottom of every
    // fruit — fakes light reflecting up from the floor, the cheapest way to
    // make the jelly art feel rendered instead of flat. GameScene syncs one
    // instance per fruit every frame (screen-space bottom, no counter-rotation
    // needed). Layered warm alphas; the sprite itself runs at ~0.4.
    g.clear();
    for (let i = 0; i < 7; i++) {
      const s = 1 - i * 0.12;
      g.fillStyle(0xffd9a0, 0.15);
      g.fillEllipse(64, 32, 122 * s, 58 * s);
    }
    g.generateTexture('bounceLight', 128, 64);
    // ring for durian-burst shockwave — generated at 256px because the
    // shockwave scales it up ~1.6x; the old 64px version upscaled 6.4x and
    // looked blurry (GameScene.shockwave divides by 256 now)
    g.clear();
    g.lineStyle(10, 0xffffff, 1);
    g.strokeCircle(128, 128, 118);
    g.generateTexture('ring', 256, 256);
    g.destroy();

    // ---- v3.3 "big-studio polish" textures (canvas radial gradients) ----
    // soft radial glow (256px): additive flash stamped at merge points —
    // tinted per fruit color in GameScene. Pure canvas, one texture reused
    // for every merge glow.
    const glowCv = document.createElement('canvas');
    glowCv.width = 256;
    glowCv.height = 256;
    {
      const c2 = glowCv.getContext('2d')!;
      const grad = c2.createRadialGradient(128, 128, 8, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.38)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c2.fillStyle = grad;
      c2.fillRect(0, 0, 256, 256);
    }
    this.textures.addCanvas('glow', glowCv);

    // vignette (420x740): feathered dark corners only — the dusk photo
    // already frames the scene, so this stays whisper-subtle (max 0.3 at the
    // extreme corners) just to seat the playfield in the frame.
    const vigCv = document.createElement('canvas');
    vigCv.width = GAME.width;
    vigCv.height = GAME.height;
    {
      const c2 = vigCv.getContext('2d')!;
      const grad = c2.createRadialGradient(
        GAME.width / 2, GAME.height / 2, 220,
        GAME.width / 2, GAME.height / 2, 470,
      );
      grad.addColorStop(0, 'rgba(24,10,0,0)');
      grad.addColorStop(1, 'rgba(24,10,0,0.3)');
      c2.fillStyle = grad;
      c2.fillRect(0, 0, GAME.width, GAME.height);
    }
    this.textures.addCanvas('vignette', vigCv);

    // danger edge (420x740): red feathered frame, alpha-driven at runtime
    // when a fruit sits in the danger zone — the "you're about to die" cue.
    const edgeCv = document.createElement('canvas');
    edgeCv.width = GAME.width;
    edgeCv.height = GAME.height;
    {
      const c2 = edgeCv.getContext('2d')!;
      const grad = c2.createRadialGradient(
        GAME.width / 2, GAME.height / 2, 200,
        GAME.width / 2, GAME.height / 2, 450,
      );
      grad.addColorStop(0, 'rgba(255,40,20,0)');
      grad.addColorStop(1, 'rgba(255,40,20,0.55)');
      c2.fillStyle = grad;
      c2.fillRect(0, 0, GAME.width, GAME.height);
    }
    this.textures.addCanvas('dangerEdge', edgeCv);

    this.scene.start('Start');
  }
}
