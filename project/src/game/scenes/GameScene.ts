/**
 * GameScene: drop → physics → merge → score → game over.
 * Merge detection uses collisionStart + a per-frame queue so each pair
 * merges at most once, even under fast collisions.
 */
import Phaser from 'phaser';
import { GAME, FRUITS, MAX_TIER, radiusForTier } from '../../config/gameConfig';
import { STR } from '../../config/strings';
import {
  pickSpawnTier,
  mergeScoreForTier,
  resolveMerge,
  clampDropX,
  dist2,
} from '../../utils/gameLogic';
import { loadBest, saveBest } from '../../utils/storage';
import { sfx } from '../../audio/sfx';
import { drawBackground } from '../systems/background';
import { makeButton, makeIconButton, makeText, FONT_FAMILY } from '../systems/ui';
import { createFruit, popIn, FruitGO } from '../systems/fruitFactory';

type State = 'aim' | 'paused' | 'over';

export class GameScene extends Phaser.Scene {
  private fruits: FruitGO[] = [];
  private pendingMerges: Array<[FruitGO, FruitGO]> = [];
  private state: State = 'aim';

  private score = 0;
  private scoreProxy = { v: 0 };
  private best = 0;
  private maxTierReached = 1;
  private currentTier = 1;
  private nextTier = 1;

  private aimX = GAME.width / 2;
  private aimImg: Phaser.GameObjects.Image | null = null;
  private aimGuide!: Phaser.GameObjects.Graphics;
  private nextImg!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private soundBtn!: Phaser.GameObjects.Text;
  private dangerGfx!: Phaser.GameObjects.Graphics;
  private dangerT = 0;
  private lastDangerBucket = -1;

  private cooldownUntil = 0;
  private mergeEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private juiceEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confettiEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** v3.3 combo: merges chained within 1.6s raise a multiplier + banner */
  private comboCount = 0;
  private lastMergeAt = 0;
  /** tiers first synthesized this session — drives the unlock toast */
  private unlockedTiers = new Set<number>();
  private comboBanner!: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Container | null = null;
  private dangerEdgeImg!: Phaser.GameObjects.Image;
  private zoomPulseAt = 0;
  /** rolling particle budget: juice bursts are capped so effects stay grand
   *  but never tank the frame rate on real phones (refills 240/sec) */
  private particleBudget = 240;
  private lastThudAt = 0;

  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private overLayer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    this.state = 'aim';
    this.score = 0;
    this.maxTierReached = 1;
    this.fruits = [];
    this.pendingMerges = [];
    this.best = loadBest();
    this.aimX = GAME.width / 2;
    this.cooldownUntil = 0;
    this.comboCount = 0;
    this.lastMergeAt = 0;
    this.unlockedTiers.clear();
    this.zoomPulseAt = 0;
    this.toast = null;

    drawBackground(this);
    this.buildWalls();
    this.buildDangerLine();
    this.buildHud();
    this.buildEmitters();
    this.buildAmbience();

    // collisions → queue, processed once per frame in update()
    this.matter.world.on('collisionstart', (event: { pairs: Array<{ bodyA: { gameObject?: unknown }; bodyB: { gameObject?: unknown } }> }) => {
      for (const pair of event.pairs) {
        const a = this.fruitFromBody(pair.bodyA.gameObject);
        const b = this.fruitFromBody(pair.bodyB.gameObject);
        if (a && b) {
          const ba = pair.bodyA as MatterJS.BodyType;
          const bb = pair.bodyB as MatterJS.BodyType;
          const rvx = ba.velocity.x - bb.velocity.x;
          const rvy = ba.velocity.y - bb.velocity.y;
          const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy);
          // 0..1 impact factor shared by squash, dust and thud
          const impact = Math.max(0, Math.min(1, (relSpeed - 4) / 22));
          this.maybeImpactThud(impact);
          this.maybeImpactSquash(a, b, ba, bb);
          this.maybeDust(a, b, impact);
          this.pendingMerges.push([a, b]);
        }
        // landing squash when a fruit first strikes the floor or the pile
        this.maybeLandSquash(a, pair.bodyB.gameObject);
        this.maybeLandSquash(b, pair.bodyA.gameObject);
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // the Matter world can already be torn down at this point (e.g. Home
      // button → scene.start('Start')); guard so the transition never throws
      this.matter.world?.off('collisionstart');
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.state !== 'aim') return;
      this.aimX = Phaser.Math.Clamp(p.x, GAME.innerLeft, GAME.innerRight);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      if (this.state !== 'aim') return;
      this.aimX = Phaser.Math.Clamp(p.x, GAME.innerLeft, GAME.innerRight);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.state !== 'aim') return;
      // ignore taps on the HUD strip so pause/sound buttons don't also drop
      if (p.y < GAME.dropMinY) return;
      this.aimX = Phaser.Math.Clamp(p.x, GAME.innerLeft, GAME.innerRight);
      this.tryDrop();
    });

    this.currentTier = pickSpawnTier(Math.random);
    this.nextTier = pickSpawnTier(Math.random);
    this.updateNextPreview();
  }

  // ---------------- construction ----------------

  private buildWalls(): void {
    const t = 14;
    // invisible physics bounds (positions unchanged)
    const mkWall = (x: number, y: number, w: number, h: number) => {
      const rect = this.add.rectangle(x, y, w, h, 0xffffff, 0);
      this.matter.add.gameObject(rect, { isStatic: true, friction: 0.4 });
    };
    mkWall(t / 2, GAME.height / 2, t, GAME.height); // left
    mkWall(GAME.width - t / 2, GAME.height / 2, t, GAME.height); // right
    mkWall(GAME.width / 2, GAME.floorTop + t, GAME.width, t * 2); // floor
    this.drawWoodFrame();
  }

  /** Wooden crate visuals over the (invisible) physics walls. */
  private drawWoodFrame(): void {
    const t = 14;
    const g = this.add.graphics().setDepth(3);
    const L = GAME.innerLeft;
    const R = GAME.innerRight;
    const F = GAME.floorTop;
    const H = GAME.height;
    // side planks: vertical gradient, plank seams, inner bevel highlight
    for (const x of [0, R]) {
      g.fillGradientStyle(0xc08a4e, 0xc08a4e, 0x8a5a2c, 0x8a5a2c, 1, 1, 1, 1);
      g.fillRect(x, 0, t, F + t);
      g.lineStyle(1.5, 0x6e4520, 0.55);
      for (let y = 46; y < F; y += 54) g.lineBetween(x + 2, y, x + t - 2, y);
      g.lineStyle(2, 0xe0b070, 0.7); // inner bevel light (v2.5: softened)
      const bx = x === 0 ? x + t - 1.5 : x + 1.5;
      g.lineBetween(bx, 4, bx, F + t - 4);
      g.lineStyle(2, 0x5e3a18, 0.55); // outer dark edge (v2.5: softened)
      const ox = x === 0 ? x + 1.5 : x + t - 1.5;
      g.lineBetween(ox, 4, ox, F + t - 4);
    }
    // floor planks: horizontal gradient + seams
    g.fillGradientStyle(0xb87f42, 0xb87f42, 0x7d5226, 0x7d5226, 1, 1, 1, 1);
    g.fillRect(0, F, GAME.width, H - F);
    g.lineStyle(1.5, 0x6e4520, 0.55);
    for (let x = 52; x < GAME.width; x += 62) g.lineBetween(x, F + 3, x, H - 3);
    g.lineStyle(2, 0xe0b070, 0.7); // (v2.5: softened)
    g.lineBetween(4, F + 1.5, GAME.width - 4, F + 1.5); // top bevel light
    g.fillStyle(0x5e3a18, 0.35); // soft contact shadow under the playfield
    g.fillRect(L, F - 6, R - L, 6);
    void L;
  }

  private buildDangerLine(): void {
    this.dangerGfx = this.add.graphics().setDepth(5);
    this.redrawDangerLine(0.45);
    makeText(this, GAME.width / 2, GAME.dangerLineY - 18, STR.dangerLine, {
      fontFamily: FONT_FAMILY, fontSize: '14px', color: '#fff3d9',
      stroke: '#a03010', strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setDepth(5);
  }

  private redrawDangerLine(alpha: number): void {
    // slim glowing ribbon: soft halo band + 2px bright core + hairline shine
    const g = this.dangerGfx;
    g.clear();
    const y = GAME.dangerLineY;
    const x0 = GAME.innerLeft + 4;
    const x1 = GAME.innerRight - 4;
    g.fillStyle(0xff5a36, 0.22 * alpha);
    g.fillRoundedRect(x0, y - 4, x1 - x0, 8, 4);
    g.lineStyle(2, 0xff6a3d, Math.min(1, alpha + 0.3));
    g.lineBetween(x0, y, x1, y);
    g.lineStyle(1, 0xffe2b8, Math.min(1, alpha + 0.4));
    g.lineBetween(x0, y - 1, x1, y - 1);
    g.setAlpha(1);
  }

  private buildHud(): void {
    // ---- frosted-glass score panel (depth 10/11: above fruits, below fx) ----
    const panel = this.add.graphics().setDepth(10);
    // soft drop shadow
    panel.fillStyle(0x2a1200, 0.25);
    panel.fillRoundedRect(13, 11, 148, 64, 16);
    // glass body
    panel.fillStyle(0xffffff, 0.15);
    panel.fillRoundedRect(10, 8, 148, 64, 16);
    // top sheen
    panel.fillStyle(0xffffff, 0.10);
    panel.fillRoundedRect(15, 12, 138, 20, 10);
    // hairline border
    panel.lineStyle(1.5, 0xffffff, 0.35);
    panel.strokeRoundedRect(10, 8, 148, 64, 16);

    makeText(this, 26, 14, STR.score, {
      fontFamily: FONT_FAMILY, fontSize: '14px', color: '#ffe9c4',
    }).setDepth(11);
    this.scoreText = makeText(this, 26, 30, '0', {
        fontFamily: FONT_FAMILY, fontSize: '36px', color: '#fff8ea',
        fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 2, color: '#5b2a00', blur: 8, fill: true },
      }).setDepth(11);

    this.bestText = makeText(this, 26, 78, `${STR.bestScore} ${this.best}`, {
      fontFamily: FONT_FAMILY, fontSize: '15px', color: '#fff3d9',
      shadow: { offsetX: 0, offsetY: 1, color: '#5b2a00', blur: 4, fill: true },
    }).setDepth(11);

    // ---- next-fruit glass badge ----
    const bx = 318, by = 40, br = 27;
    const badge = this.add.graphics().setDepth(10);
    badge.fillStyle(0x2a1200, 0.25);
    badge.fillCircle(bx, by + 2, br);
    badge.fillStyle(0xffffff, 0.15);
    badge.fillCircle(bx, by, br);
    badge.lineStyle(1.5, 0xffffff, 0.35);
    badge.strokeCircle(bx, by, br);
    badge.lineStyle(2, 0xffd98a, 0.45);
    badge.strokeCircle(bx, by, br - 4);
    makeText(this, bx, by - br - 16, STR.next, {
      fontFamily: FONT_FAMILY, fontSize: '14px', color: '#ffe9c4',
      shadow: { offsetX: 0, offsetY: 1, color: '#5b2a00', blur: 4, fill: true },
    }).setOrigin(0.5).setDepth(11);
    this.nextImg = this.add.image(bx, by, 'fruit_01').setDisplaySize(34, 34).setDepth(11);

    makeIconButton(this, 386, 26, STR.pauseIcon, () => this.togglePause());
    this.soundBtn = makeIconButton(this, 386, 62, sfx.isMuted() ? STR.soundOff : STR.soundOn, () => {
      const m = sfx.toggleMuted();
      this.soundBtn.setText(m ? STR.soundOff : STR.soundOn);
    });

    this.aimGuide = this.add.graphics().setDepth(4);
  }

  private buildEmitters(): void {
    // one reusable emitter for all merge/burst particles — explode() reuses
    // the same emitter, so merges never allocate new particle systems
    this.mergeEmitter = this.add.particles(0, 0, 'dot', {
      speed: { min: 90, max: 280 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 300, max: 600 },
      scale: { start: 0.3, end: 0 }, // 48px dot texture → ~14px particles
      quantity: 0,
      emitting: false,
    });
    this.mergeEmitter.setDepth(20);
    // juice droplets: same reusable-emitter pattern, but with gravity so the
    // splash arcs and falls like real juice; tinted per merge, count scaled
    // by tier and hard-capped by particleBudget in doMergeSpawn
    this.juiceEmitter = this.add.particles(0, 0, 'dot', {
      speed: { min: 120, max: 420 },
      angle: { min: 0, max: 360 },
      gravityY: 900,
      lifespan: { min: 350, max: 750 },
      scale: { start: 0.32, end: 0 },
      quantity: 0,
      emitting: false,
    });
    this.juiceEmitter.setDepth(19);
    // impact dust: tiny cream puffs at contact points, same 'dot' texture as
    // the juice system. explode() is one-shot; counts are scaled per impact
    // in maybeDust(), so resting piles never spam particles.
    this.dustEmitter = this.add.particles(0, 0, 'dot', {
      speed: { min: 25, max: 110 },
      angle: { min: 0, max: 360 },
      gravityY: -60,
      lifespan: { min: 220, max: 420 },
      scale: { start: 0.22, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: 0xfff3df,
      quantity: 0,
      emitting: false,
    });
    this.dustEmitter.setDepth(18);
    // new-record confetti: gravity-driven colored burst, one-shot
    this.confettiEmitter = this.add.particles(0, 0, 'dot', {
      speed: { min: 200, max: 520 },
      angle: { min: 0, max: 360 },
      gravityY: 850,
      lifespan: { min: 800, max: 1500 },
      scale: { start: 0.3, end: 0.08 },
      alpha: { start: 1, end: 0.4 },
      quantity: 0,
      emitting: false,
    });
    this.confettiEmitter.setDepth(110);
  }

  /** v3.3 ambience: whisper-subtle vignette, red danger edge, combo banner */
  private buildAmbience(): void {
    // vignette (depth 6: above the fruit layer, below HUD) — feathered dark
    // corners only, seats the playfield in the frame
    this.add.image(GAME.width / 2, GAME.height / 2, 'vignette').setDepth(6);
    // red danger edge: alpha driven per-frame in update() while a fruit sits
    // in the danger zone
    this.dangerEdgeImg = this.add
      .image(GAME.width / 2, GAME.height / 2, 'dangerEdge')
      .setDepth(60)
      .setAlpha(0);
    // combo banner, center stage
    this.comboBanner = makeText(this, GAME.width / 2, 300, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '46px',
        color: '#ffd23f',
        fontStyle: 'bold',
        stroke: '#a03010',
        strokeThickness: 7,
        shadow: { offsetX: 0, offsetY: 3, color: '#5b2a00', blur: 10, fill: true },
      })
      .setOrigin(0.5)
      .setDepth(40)
      .setAlpha(0)
      .setScale(0.5);
  }

  /**
   * (contact-AO shadows removed 2026-09-24 per Ly: no shadow stamped at
   * fruit-vs-fruit contact points — touching fruits should read clean.)

  /**
   * Resting contact squash — the soft-body half of the "not stickers" brief.
   * v2.3's impact squash only fires on collisionstart; a settled pile is
   * rigid circles with hard wedge gaps between them. Every frame we read
   * Matter's active pairs, accumulate each fruit's dominant contact axis
   * (sign-free, so a fruit pressed top AND bottom still reads as vertical
   * pressure), and lerp its scale toward 6% compression along the axis /
   * 3% stretch across it. No contact → lerp back to the round base scale.
   *
   * Coordination with the other scale writers: impact squash ('squashing'),
   * popIn ('popping'), land squash ('landing') and merges each own the scale
   * while their flag is set — resting pauses for that fruit and resumes
   * after. Fruit-vs-floor/wall contacts flatten the bottom/side the same way.
   */
  private updateRestingSquash(delta: number): void {
    for (const f of this.fruits) {
      if (!f.active) continue;
      f.setData('restAX', 0);
      f.setData('restAY', 0);
      f.setData('restN', 0);
    }
    const pairs = (this.matter.world.engine.pairs?.list ?? []) as Array<{
      bodyA: { gameObject?: unknown; position: { x: number; y: number } };
      bodyB: { gameObject?: unknown; position: { x: number; y: number } };
      isActive?: boolean;
    }>;
    for (const pair of pairs) {
      if (pair.isActive === false) continue;
      const goA = pair.bodyA.gameObject as FruitGO | undefined;
      const goB = pair.bodyB.gameObject as FruitGO | undefined;
      const fa = goA && goA.active && goA.getData('isFruit') ? goA : null;
      const fb = goB && goB.active && goB.getData('isFruit') ? goB : null;
      if (!fa && !fb) continue;
      if (fa && (fa.getData('merging') || fa.getData('popping'))) continue;
      if (fb && (fb.getData('merging') || fb.getData('popping'))) continue;
      // squash is symmetric: accumulate |axis| so opposite contacts add up
      let dx = pair.bodyB.position.x - pair.bodyA.position.x;
      let dy = pair.bodyB.position.y - pair.bodyA.position.y;
      const l = Math.hypot(dx, dy);
      if (l < 0.01) continue;
      dx = Math.abs(dx / l);
      dy = Math.abs(dy / l);
      if (fa) {
        fa.setData('restAX', (fa.getData('restAX') as number) + dx);
        fa.setData('restAY', (fa.getData('restAY') as number) + dy);
        fa.setData('restN', (fa.getData('restN') as number) + 1);
      }
      if (fb) {
        fb.setData('restAX', (fb.getData('restAX') as number) + dx);
        fb.setData('restAY', (fb.getData('restAY') as number) + dy);
        fb.setData('restN', (fb.getData('restN') as number) + 1);
      }
    }
    const k = Math.min(1, delta * 0.012);
    for (const f of this.fruits) {
      if (!f.active) continue;
      if (f.getData('merging') || f.getData('popping') || f.getData('squashing') || f.getData('landing')) continue;
      const baseSX = f.getData('baseSX') as number | undefined;
      const baseSY = f.getData('baseSY') as number | undefined;
      if (!baseSX || !baseSY) continue;
      let tSX = baseSX;
      let tSY = baseSY;
      if ((f.getData('restN') as number) > 0) {
        const horizontal = (f.getData('restAX') as number) >= (f.getData('restAY') as number);
        tSX = baseSX * (horizontal ? 0.94 : 1.03);
        tSY = baseSY * (horizontal ? 1.03 : 0.94);
      }
      const nSX = f.scaleX + (tSX - f.scaleX) * k;
      const nSY = f.scaleY + (tSY - f.scaleY) * k;
      f.setScale(
        Math.abs(tSX - nSX) < 0.0004 ? tSX : nSX,
        Math.abs(tSY - nSY) < 0.0004 ? tSY : nSY,
      );
    }
  }

  // ---------------- aiming & dropping ----------------

  private showAimFruit(): void {
    if (this.aimImg || this.state !== 'aim') return;
    const r = radiusForTier(this.currentTier);
    const x = clampDropX(this.aimX, r);
    this.aimImg = this.add
      .image(x, GAME.aimY, FRUITS[this.currentTier - 1].tex)
      .setDisplaySize(r * 2, r * 2)
      .setAlpha(0.92)
      .setDepth(4);
    const s = this.aimImg.scaleX;
    this.aimImg.setScale(s * 0.6);
    this.tweens.add({ targets: this.aimImg, scaleX: s, scaleY: s, duration: 140, ease: 'Back.easeOut' });
  }

  private tryDrop(): void {
    if (this.state !== 'aim' || !this.aimImg) return;
    const now = this.time.now;
    if (now < this.cooldownUntil) return;

    const tier = this.currentTier;
    const r = radiusForTier(tier);
    const x = clampDropX(this.aimX, r);
    const fruit = createFruit(this, x, GAME.aimY, tier, now);
    // slight downward kick on release so the drop feels decisive
    fruit.setVelocity(0, 4);
    this.fruits.push(fruit);
    this.enforceCap();
    this.maxTierReached = Math.max(this.maxTierReached, tier);

    this.tweens.killTweensOf(this.aimImg);
    this.aimImg.destroy();
    this.aimImg = null;
    sfx.drop();
    this.currentTier = this.nextTier;
    this.nextTier = pickSpawnTier(Math.random);
    this.updateNextPreview();
    this.cooldownUntil = now + GAME.dropCooldownMs;
  }

  private updateNextPreview(): void {
    this.nextImg.setTexture(FRUITS[this.nextTier - 1].tex).setDisplaySize(34, 34);
  }

  private enforceCap(): void {
    while (this.fruits.length > GAME.maxLiveFruits) {
      // remove the oldest lowest-tier fruit (should basically never trigger)
      let victim = this.fruits[0];
      for (const f of this.fruits) {
        const ft = f.getData('tier') as number;
        const vt = victim.getData('tier') as number;
        if (ft < vt || (ft === vt && (f.getData('bornAt') as number) < (victim.getData('bornAt') as number))) {
          victim = f;
        }
      }
      this.burstPop(victim.x, victim.y, 0xcccccc, 6);
      this.removeFruit(victim);
    }
  }

  // ---------------- merging ----------------

  private fruitFromBody(gameObject: unknown): FruitGO | null {
    const go = gameObject as FruitGO | undefined;
    if (!go || !go.active) return null;
    if (!go.getData('isFruit')) return null;
    if (go.getData('merging')) return null;
    return go;
  }

  /** Impact-scaled contact thud (90ms throttle): gentle tap → heavy knock. */
  private maybeImpactThud(intensity: number): void {
    const now = this.time.now;
    if (now - this.lastThudAt < 90) return;
    this.lastThudAt = now;
    sfx.impact(intensity);
  }

  /** Directional squash & stretch on fruit-vs-fruit impacts.
   *  Squash axis follows the collision normal (2-axis approximation: pick the
   *  dominant world axis — no rotation juggling, so it never fights the Matter
   *  body sync), magnitude scales with impact speed: light touches do nothing,
   *  hard slams visibly deform. Two-phase: fast squash-in, then spring back
   *  with Back.easeOut. Per-fruit 350ms cooldown + 'squashing' guard keep
   *  tween spam at zero; popIn/merge tweens own the scale while 'popping'. */
  private maybeImpactSquash(a: FruitGO, b: FruitGO, bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType): void {
    const rvx = bodyA.velocity.x - bodyB.velocity.x;
    const rvy = bodyA.velocity.y - bodyB.velocity.y;
    const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy);
    if (relSpeed < 4) return; // too soft to read
    // 0..1 impact factor: ramps in over speeds 4..26
    const k = Math.min(1, (relSpeed - 4) / 22);
    // collision normal (A → B); squash along the dominant axis
    let nx = b.x - a.x;
    let ny = b.y - a.y;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const horizontal = Math.abs(nx) >= Math.abs(ny);
    const now = this.time.now;
    const pair: Array<FruitGO> = [a, b];
    for (const f of pair) {
      if (!f.active || f.getData('popping') || f.getData('squashing') || f.getData('merging')) continue;
      const last = (f.getData('lastSquash') as number) || 0;
      if (now - last < 350) continue;
      f.setData('lastSquash', now);
      f.setData('squashing', true);
      const sx = f.scaleX;
      const sy = f.scaleY;
      const squash = 1 - 0.3 * k;
      const stretch = 1 + 0.21 * k;
      const midX = horizontal ? sx * squash : sx * stretch;
      const midY = horizontal ? sy * stretch : sy * squash;
      this.tweens.add({
        targets: f,
        scaleX: midX,
        scaleY: midY,
        duration: 70,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (!f.active) return;
          this.tweens.add({
            targets: f,
            scaleX: sx,
            scaleY: sy,
            duration: 280,
            ease: 'Back.easeOut',
            onComplete: () => {
              if (f.active) {
                f.setScale(sx, sy);
                f.setData('squashing', false);
              }
            },
          });
        },
      });
    }
  }

  /** Dust puff at the contact point, scaled by impact 0..1. Fired from
   *  collisionstart only (resting piles don't re-fire), so no spam. */
  private maybeDust(a: FruitGO, b: FruitGO, intensity: number): void {
    if (intensity <= 0) return;
    const r1 = radiusForTier(a.getData('tier') as number);
    const r2 = radiusForTier(b.getData('tier') as number);
    const t = r1 / (r1 + r2);
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    this.dustEmitter.explode(Math.round(2 + 6 * intensity), px, py);
  }

  /** Squash & stretch when a fruit first lands on the floor or the pile. */
  private maybeLandSquash(fruit: FruitGO | null, otherGO: unknown): void {
    if (!fruit || !fruit.body || fruit.getData('hasLanded')) return;
    if (fruit.getData('popping')) return; // popIn tween owns the scale right now
    const body = fruit.body as MatterJS.BodyType;
    const vy = body.velocity.y;
    if (vy < 4) return; // only hard downward landings
    const other = otherGO as FruitGO | undefined;
    const otherIsFruit = !!(other && other.getData && other.getData('isFruit'));
    if (otherIsFruit) {
      // pile landing: only when we're above the other fruit
      if (fruit.y > (other as FruitGO).y + 2) return;
    } else if (Math.abs(body.velocity.x) > vy) {
      return; // side brush against a wall, not a landing
    }
    fruit.setData('hasLanded', true);
    // 'landing' guard: updateRestingSquash() must not fight this tween's scale
    fruit.setData('landing', true);
    const sx = fruit.scaleX;
    const sy = fruit.scaleY;
    // brief squash; the Matter body follows the scale (by design), which reads
    // as soft-fruit impact and settles back exactly.
    this.tweens.add({
      targets: fruit,
      scaleX: sx * 1.24,
      scaleY: sy * 0.74,
      duration: 100,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        if (fruit.active) {
          fruit.setScale(sx, sy);
          fruit.setData('landing', false);
        }
      },
    });
    sfx.land();
  }

  private processMerges(): void {
    const n = this.pendingMerges.length;
    if (n === 0) return;
    // iterate in place and reset length — no per-frame array allocation
    for (let i = 0; i < n; i++) {
      const a = this.pendingMerges[i][0];
      const b = this.pendingMerges[i][1];
      if (!a.active || !b.active) continue;
      if (a.getData('merging') || b.getData('merging')) continue;
      const ta = a.getData('tier') as number;
      const tb = b.getData('tier') as number;
      const outcome = resolveMerge(ta, tb);
      if (outcome.kind === 'none') continue;

      a.setData('merging', true);
      b.setData('merging', true);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      this.removeFruit(a);
      this.removeFruit(b);

      if (outcome.kind === 'merge') {
        this.doMergeSpawn(outcome.newTier, mx, my);
      } else {
        this.doDurianBurst(mx, my);
      }
    }
    // reuse the queue array instead of allocating a fresh one each frame
    this.pendingMerges.length = 0;
  }

  private doMergeSpawn(newTier: number, x: number, y: number): void {
    const now = this.time.now;
    // v3.3 combo: merges chained within 1.6s — banner + score multiplier
    // (×1.25 per step) + rising merge pitch. The window is generous on
    // purpose: it rewards cascade chains, the most satisfying moment.
    this.comboCount = now - this.lastMergeAt < 1600 ? this.comboCount + 1 : 1;
    this.lastMergeAt = now;

    const fruit = createFruit(this, x, y, newTier, now);
    // "squeezed out" feel: a tiny upward hop on birth (popIn adds the scale pop)
    fruit.setVelocity(0, -1.8);
    this.fruits.push(fruit);
    this.enforceCap();
    this.maxTierReached = Math.max(this.maxTierReached, newTier);

    const color = FRUITS[newTier - 1].color;
    const gained = Math.round(mergeScoreForTier(newTier) * (1 + 0.25 * (this.comboCount - 1)));
    this.addScore(gained);
    if (this.comboCount >= 2) this.showComboBanner(this.comboCount);
    this.floatText(x, y - radiusForTier(newTier) - 6, `+${gained}`, '#e67e22', 22);

    // first synthesis of a tier (3+) this session gets a celebration toast
    if (newTier >= 3 && !this.unlockedTiers.has(newTier)) {
      this.unlockedTiers.add(newTier);
      this.showUnlockToast(newTier);
    }

    // merge glow: soft additive halo in the new fruit's color, blooms and
    // fades — the "impact light" that sells the merge moment
    const glow = this.add
      .image(x, y, 'glow')
      .setDepth(21)
      .setTint(color)
      .setAlpha(0.75)
      .setScale(0.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    const glowTarget = (radiusForTier(newTier) * 3.6) / 256;
    this.tweens.add({
      targets: glow,
      scaleX: glowTarget,
      scaleY: glowTarget,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy(),
    });

    // camera kick on medium+ merges (350ms guard: chains thump, not wobble)
    if (newTier >= 5 && now - this.zoomPulseAt > 350) {
      this.zoomPulseAt = now;
      this.cameras.main.zoomTo(1.018, 110, 'Quad.easeOut');
      this.time.delayedCall(120, () => this.cameras.main.zoomTo(1, 160, 'Quad.easeInOut'));
    }

    // juice splash: droplet count scales with tier, hard-capped by the rolling
    // particle budget so the effect stays grand without dropping frames
    const want = Math.min(12 + newTier * 4, 48);
    const n = Math.min(want, Math.floor(this.particleBudget));
    this.particleBudget -= n;
    if (n > 0) {
      this.juiceEmitter.setParticleTint(color);
      this.juiceEmitter.explode(n, x, y);
    }
    this.mergeRing(x, y, newTier, color);

    // big merges (tier 7+) get a whisper of drama: subtle shake + soft flash
    if (newTier >= 7) {
      this.cameras.main.shake(130, 0.0035);
      const flash = this.add
        .rectangle(0, 0, GAME.width, GAME.height, 0xffffff)
        .setOrigin(0)
        .setAlpha(0.16)
        .setDepth(60);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => flash.destroy(),
      });
    }

    this.mergeEmitter.setParticleTint(color);
    this.mergeEmitter.explode(16, x, y);
    popIn(this, fruit);
    sfx.merge(newTier, this.comboCount);
  }

  /** Combo banner: bouncy scale pop center-stage, holds, then fades. */
  private showComboBanner(n: number): void {
    const b = this.comboBanner;
    this.tweens.killTweensOf(b);
    b.setText(`${STR.combo} x${n}！`);
    b.setAlpha(1).setScale(0.5);
    this.tweens.add({
      targets: b,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 160,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!b.active) return;
        this.tweens.add({ targets: b, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.easeOut' });
      },
    });
    this.tweens.add({
      targets: b,
      alpha: 0,
      delay: 750,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => b.setScale(0.5),
    });
  }

  /** "New fruit unlocked" toast under the HUD — slides down with a gold
   *  sparkle, holds, slides away. One instance at a time; a fresh unlock
   *  replaces the old toast instantly. */
  private showUnlockToast(tier: number): void {
    if (this.toast) {
      this.tweens.killTweensOf(this.toast);
      this.toast.destroy();
      this.toast = null;
    }
    const cx = GAME.width / 2;
    const g = this.add.graphics();
    const w = 310;
    const h = 48;
    g.fillStyle(0x1c0e00, 0.8);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    g.lineStyle(2, 0xffd23f, 0.85);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 24);
    const t = makeText(this, 0, 0, `${STR.unlockNew}${FRUITS[tier - 1].nameZh}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '21px',
        color: '#ffe9c4',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const c = this.add.container(cx, 120, [g, t]).setDepth(90).setAlpha(0);
    this.toast = c;
    this.mergeEmitter.setParticleTint(0xffd23f);
    this.mergeEmitter.explode(14, cx, 130);
    sfx.fanfare();
    this.tweens.add({ targets: c, y: 168, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c,
      alpha: 0,
      y: 138,
      delay: 1600,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (this.toast === c) {
          c.destroy();
          this.toast = null;
        }
      },
    });
  }

  /** Expanding light ring on merge, tinted with the new fruit's color. */
  private mergeRing(x: number, y: number, tier: number, color: number): void {
    const ring = this.add
      .image(x, y, 'ring')
      .setDepth(21)
      .setTint(color)
      .setAlpha(0.85)
      .setScale(0.15);
    const target = (radiusForTier(tier) * 3.2) / 256; // 'ring' texture is 256px
    this.tweens.add({
      targets: ring,
      scaleX: target,
      scaleY: target,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private doDurianBurst(x: number, y: number): void {
    this.addScore(GAME.burst.bonusScore);
    this.floatText(x, y - 20, `+${GAME.burst.bonusScore}`, '#f1c40f', 34);
    this.shockwave(x, y);
    sfx.burst();

    const r2 = GAME.burst.radius * GAME.burst.radius;
    const victims = this.fruits.filter((f) => {
      if (!f.active || f.getData('merging')) return false;
      const t = f.getData('tier') as number;
      return t <= GAME.burst.maxTierRemoved && dist2(f.x, f.y, x, y) <= r2;
    });
    for (const v of victims) {
      this.burstPop(v.x, v.y, FRUITS[(v.getData('tier') as number) - 1].color, 8);
      this.removeFruit(v);
    }
  }

  private removeFruit(f: FruitGO): void {
    const i = this.fruits.indexOf(f);
    if (i >= 0) this.fruits.splice(i, 1);
    // the blob shadow and jelly gloss are separate GameObjects — destroy
    // them with the fruit
    const sh = f.getData('shadow') as Phaser.GameObjects.Image | undefined;
    if (sh && sh.active) sh.destroy();
    const gl = f.getData('gloss') as Phaser.GameObjects.Image | undefined;
    if (gl && gl.active) gl.destroy();
    const bo = f.getData('bounce') as Phaser.GameObjects.Image | undefined;
    if (bo && bo.active) bo.destroy();
    // a chained merge can destroy a fruit while its pop tween is still
    // running — kill tweens first, otherwise the tween writes scale to a
    // dead Matter body and throws.
    this.tweens.killTweensOf(f);
    f.destroy();
  }

  // ---------------- juice ----------------

  private floatText(x: number, y: number, str: string, color: string, size: number): void {
    const t = makeText(this, x, y, str, {
        fontSize: `${size}px`,
        color,
        fontStyle: 'bold',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScale(0.55);
    // bouncy scale pop, then drift up and fade
    this.tweens.add({
      targets: t,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 170,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!t.active) return;
        this.tweens.add({
          targets: t,
          scaleX: 1,
          scaleY: 1,
          duration: 130,
          ease: 'Quad.easeOut',
        });
      },
    });
    this.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      duration: 750,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  private burstPop(x: number, y: number, tint: number, count: number): void {
    this.mergeEmitter.setParticleTint(tint);
    this.mergeEmitter.explode(count, x, y);
  }

  private shockwave(x: number, y: number): void {
    const ring = this.add.image(x, y, 'ring').setDepth(25).setAlpha(0.95).setTint(0xffd23f);
    const target = (GAME.burst.radius * 2.4) / 256; // 'ring' texture is 256px
    this.tweens.add({
      targets: ring,
      scaleX: target,
      scaleY: target,
      alpha: 0,
      duration: 480,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  private addScore(n: number): void {
    this.score += n;
    // rolling count-up toward the true score — killTweensOf on the shared
    // proxy retargets cleanly when merges land in quick succession
    this.tweens.killTweensOf(this.scoreProxy);
    this.tweens.add({
      targets: this.scoreProxy,
      v: this.score,
      duration: 400,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.scoreText.setText(String(Math.round(this.scoreProxy.v))),
    });
    // juicy pop on every score change
    this.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1.25);
    this.tweens.add({
      targets: this.scoreText, scaleX: 1, scaleY: 1,
      duration: 160, ease: 'Back.easeOut',
    });
  }

  // ---------------- danger / game over ----------------

  private checkDanger(now: number): boolean {
    let anyInZone = false;
    for (const f of this.fruits) {
      if (!f.active || f.getData('merging')) continue;
      if (f.y < GAME.dangerLineY && now - (f.getData('bornAt') as number) > GAME.dangerGraceMs) {
        anyInZone = true;
        const since = f.getData('dangerSince') as number;
        if (!since) {
          f.setData('dangerSince', now);
        } else if (now - since >= GAME.dangerHoldMs) {
          this.gameOver();
          return true;
        }
      } else {
        f.setData('dangerSince', 0);
      }
    }
    const pulse = anyInZone ? 0.55 + 0.4 * Math.abs(Math.sin(now / 130)) : 0.45;
    // skip redundant graphics redraws: the idle pulse is constant, so only
    // redraw when the quantized alpha bucket actually changes
    const bucket = Math.round(pulse * 40);
    if (bucket !== this.lastDangerBucket) {
      this.lastDangerBucket = bucket;
      this.redrawDangerLine(pulse);
    }
    return anyInZone;
  }

  private gameOver(): void {
    if (this.state !== 'aim') return;
    this.state = 'over';
    this.matter.world.pause();
    sfx.gameOver();

    const isRecord = this.score > this.best;
    if (isRecord) {
      this.best = this.score;
      saveBest(this.best);
      this.bestText.setText(`${STR.bestScore} ${this.best}`);
    }
    if (this.aimImg) {
      this.tweens.killTweensOf(this.aimImg);
    this.aimImg.destroy();
      this.aimImg = null;
    }
    this.aimGuide.clear();
    this.showGameOverPanel(isRecord);
  }

  private showGameOverPanel(isRecord: boolean): void {
    const cx = GAME.width / 2;
    const cy = GAME.height / 2;
    const layer = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(cx, cy, GAME.width, GAME.height, 0x000000, 0.55).setInteractive();
    const panel = this.add.graphics();
    // soft drop shadow for lift
    panel.fillStyle(0x2a1200, 0.3);
    panel.fillRoundedRect(cx - 165, cy - 190 + 8, 330, 380, 18);
    panel.fillStyle(0xfffdf4, 1);
    panel.fillRoundedRect(cx - 165, cy - 190, 330, 380, 18);
    // top sheen
    panel.fillStyle(0xffffff, 0.5);
    panel.fillRoundedRect(cx - 155, cy - 182, 310, 44, 14);
    panel.lineStyle(3, 0xe0a83e, 1);
    panel.strokeRoundedRect(cx - 165, cy - 190, 330, 380, 18);

    const title = makeText(this, cx, cy - 150, STR.gameOver, {
        fontSize: '34px', color: '#c0392b', fontStyle: 'bold',
        shadow: { offsetX: 0, offsetY: 2, color: '#f5d9a8', blur: 0, fill: true },
      })
      .setOrigin(0.5);
    const recordTxt = isRecord
      ? makeText(this, cx, cy - 112, STR.newRecord, { fontSize: '18px', color: '#e67e22', fontStyle: 'bold' }).setOrigin(0.5)
      : null;
    const scoreTxt = makeText(this, cx, cy - 66, `${STR.yourScore}\n${this.score}`, {
        fontSize: '22px',
        color: '#4a2f12',
        align: 'center',
        fontStyle: 'bold',
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    const bestTxt = makeText(this, cx, cy + 2, `${STR.bestScore}：${this.best}`, { fontSize: '18px', color: '#7a5a2e' })
      .setOrigin(0.5);

    const topDef = FRUITS[this.maxTierReached - 1];
    const fruitImg = this.add.image(cx - 52, cy + 52, topDef.tex).setDisplaySize(44, 44);
    const fruitTxt = makeText(this, cx + 62, cy + 52, `${STR.highestFruit}\n${topDef.nameZh}`, {
        fontSize: '18px',
        color: '#4a7c2f',
        align: 'center',
        fontStyle: 'bold',
        lineSpacing: 4,
      })
      .setOrigin(0.5);

    const replayBtn = makeButton(this, cx, cy + 122, 220, 56, STR.replay, () => this.restartGame(), { depth: 101 });
    const homeBtn = makeButton(this, cx, cy + 188 - 8, 220, 48, STR.home, () => this.scene.start('Start'), {
      fill: 0xf5e6c8,
      stroke: 0xd9b06a,
      fontSize: 20,
      depth: 101,
    });

    const kids: Phaser.GameObjects.GameObject[] = [dim, panel, title, scoreTxt, bestTxt, fruitImg, fruitTxt, replayBtn, homeBtn];
    if (recordTxt) kids.push(recordTxt);
    layer.add(kids);
    layer.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: layer, scaleX: 1, scaleY: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    this.overLayer = layer;
    // new record: confetti rain + the badge keeps bouncing
    if (isRecord) {
      const cols = [0xffd23f, 0xff6b9d, 0x7ddf8a, 0x7fb8ff];
      for (const col of cols) {
        this.confettiEmitter.setParticleTint(col);
        this.confettiEmitter.explode(20, cx + Phaser.Math.Between(-90, 90), cy - 210);
      }
      if (recordTxt) {
        this.tweens.add({
          targets: recordTxt,
          scaleX: 1.18,
          scaleY: 1.18,
          duration: 420,
          ease: 'Sine.easeInOut',
          yoyo: true,
          repeat: -1,
        });
      }
    }
  }

  // ---------------- pause ----------------

  private togglePause(): void {
    if (this.state === 'aim') {
      this.state = 'paused';
      this.matter.world.pause();
      this.showPausePanel();
    } else if (this.state === 'paused') {
      this.resumeGame();
    }
  }

  private showPausePanel(): void {
    const cx = GAME.width / 2;
    const cy = GAME.height / 2;
    const layer = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(cx, cy, GAME.width, GAME.height, 0x000000, 0.5).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xfffdf4, 1);
    panel.fillRoundedRect(cx - 140, cy - 130, 280, 260, 18);
    const title = makeText(this, cx, cy - 92, STR.paused, { fontSize: '30px', color: '#4a2f12', fontStyle: 'bold' })
      .setOrigin(0.5);
    const resumeBtn = makeButton(this, cx, cy - 24, 200, 52, STR.resume, () => this.resumeGame(), { depth: 101 });
    const restartBtn = makeButton(this, cx, cy + 44, 200, 52, STR.restart, () => this.restartGame(), {
      fill: 0xf5e6c8,
      stroke: 0xd9b06a,
      fontSize: 20,
      depth: 101,
    });
    const homeBtn = makeButton(this, cx, cy + 104, 200, 44, STR.home, () => this.scene.start('Start'), {
      fill: 0xeeeeee,
      stroke: 0xbbbbbb,
      fontSize: 18,
      depth: 101,
    });
    layer.add([dim, panel, title, resumeBtn, restartBtn, homeBtn]);
    this.pauseLayer = layer;
  }

  private resumeGame(): void {
    if (this.pauseLayer) {
      this.pauseLayer.destroy();
      this.pauseLayer = null;
    }
    this.state = 'aim';
    this.matter.world.resume();
  }

  private restartGame(): void {
    if (this.pauseLayer) {
      this.pauseLayer.destroy();
      this.pauseLayer = null;
    }
    if (this.overLayer) {
      this.overLayer.destroy();
      this.overLayer = null;
    }
    for (const f of [...this.fruits]) this.removeFruit(f);
    this.pendingMerges = [];
    this.score = 0;
    this.scoreProxy.v = 0;
    this.scoreText.setText('0');
    this.maxTierReached = 1;
    this.comboCount = 0;
    this.lastMergeAt = 0;
    this.unlockedTiers.clear();
    this.zoomPulseAt = 0;
    if (this.toast) {
      this.tweens.killTweensOf(this.toast);
      this.toast.destroy();
      this.toast = null;
    }
    this.state = 'aim';
    this.matter.world.resume();
    this.currentTier = pickSpawnTier(Math.random);
    this.nextTier = pickSpawnTier(Math.random);
    this.updateNextPreview();
    this.cooldownUntil = 0;
    this.showAimFruit();
  }

  // ---------------- main loop ----------------

  update(time: number, delta: number): void {
    if (this.state === 'paused' || this.state === 'over') return;

    // refill the juice particle budget (~240 particles/sec)
    this.particleBudget = Math.min(240, this.particleBudget + delta * 0.24);

    // aim fruit follows pointer
    if (!this.aimImg && time >= this.cooldownUntil) this.showAimFruit();
    if (this.aimImg) {
      const r = radiusForTier(this.currentTier);
      this.aimImg.x = clampDropX(this.aimX, r);
      this.aimImg.y = GAME.aimY + Math.sin(time / 320) * 3;
      // clear, dotted aim guide with a landing marker
      this.aimGuide.clear();
      const gx = this.aimImg.x;
      // landing marker: pulsing ring resting ON the floor (bottom of the
      // ring kisses floorTop, so it never dips into the wooden frame)
      const pulse = 1 + Math.sin(time / 240) * 0.12;
      const ringR = r * pulse;
      const ringY = GAME.floorTop - ringR;
      const y0 = GAME.aimY + r + 6;
      const y1 = ringY - ringR - 8;
      this.aimGuide.fillStyle(0x4a7c2f, 0.55);
      for (let y = y0; y < y1; y += 14) {
        this.aimGuide.fillCircle(gx, y, 2.5);
      }
      this.aimGuide.lineStyle(2.5, 0x4a7c2f, 0.65);
      this.aimGuide.strokeCircle(gx, ringY, ringR);
    } else {
      this.aimGuide.clear();
    }

    this.processMerges();
    const inDanger = this.checkDanger(time);
    // red danger edge: ease toward a pulsing target while any fruit sits in
    // the danger zone, ease back to 0 otherwise
    const edgeTarget = inDanger ? 0.5 + 0.3 * Math.abs(Math.sin(time / 160)) : 0;
    const edge = this.dangerEdgeImg;
    edge.setAlpha(edge.alpha + (edgeTarget - edge.alpha) * Math.min(1, delta * 0.008));
    this.updateShadows();
    this.updateRestingSquash(delta);
    // danger line breathing pulse
    this.dangerT += delta;
    this.dangerGfx.setAlpha(0.82 + 0.18 * Math.sin(this.dangerT / 520));
  }

  /** Sync each fruit's followers: the blob shadow glued under the fruit
   *  (shrinking/fading as the fruit rises — sells the 3D depth), the jelly
   *  gloss highlight (screen-space top-left, counter-rotated against the
   *  fruit's roll, deforming with the resting squash), and the warm bounce
   *  light at the screen-space bottom (never rotated). Allocation-free. */
  private updateShadows(): void {
    for (const f of this.fruits) {
      if (!f.active) continue;
      const r = radiusForTier(f.getData('tier') as number);
      const sh = f.getData('shadow') as Phaser.GameObjects.Image | undefined;
      if (sh && sh.active) {
        const hFrac = Phaser.Math.Clamp((GAME.floorTop - f.y) / GAME.floorTop, 0, 1);
        sh.x = f.x;
        sh.y = f.y + r * (0.92 - 0.3 * hFrac);
        const s = 1 - 0.35 * hFrac;
        sh.setScale((f.getData('shSX') as number) * s, (f.getData('shSY') as number) * s);
        sh.setAlpha(0.3 * (1 - 0.45 * hFrac));
      }
      const gl = f.getData('gloss') as Phaser.GameObjects.Image | undefined;
      if (gl && gl.active) {
        const baseSX = f.getData('baseSX') as number;
        const baseSY = f.getData('baseSY') as number;
        const kx = f.scaleX / baseSX;
        const ky = f.scaleY / baseSY;
        gl.x = f.x - r * 0.3 * kx;
        gl.y = f.y - r * 0.36 * ky;
        gl.setScale((f.getData('glSX') as number) * kx, (f.getData('glSY') as number) * ky);
        gl.setRotation(-0.45 - f.rotation);
      }
      const bo = f.getData('bounce') as Phaser.GameObjects.Image | undefined;
      if (bo && bo.active) {
        const baseSX = f.getData('baseSX') as number;
        const baseSY = f.getData('baseSY') as number;
        const kx = f.scaleX / baseSX;
        const ky = f.scaleY / baseSY;
        bo.x = f.x;
        bo.y = f.y + r * 0.45 * ky;
        bo.setScale((f.getData('bSX') as number) * kx, (f.getData('bSY') as number) * ky);
      }
    }
  }
}
