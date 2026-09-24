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
import { makeButton, makeIconButton, FONT_FAMILY } from '../systems/ui';
import { createFruit, popIn, FruitGO } from '../systems/fruitFactory';

type State = 'aim' | 'paused' | 'over';

export class GameScene extends Phaser.Scene {
  private fruits: FruitGO[] = [];
  private pendingMerges: Array<[FruitGO, FruitGO]> = [];
  private state: State = 'aim';

  private score = 0;
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
  private lastDangerBucket = -1;

  private cooldownUntil = 0;
  private mergeEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private juiceEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** rolling particle budget: juice bursts are capped so effects stay grand
   *  but never tank the frame rate on real phones (refills 240/sec) */
  private particleBudget = 240;
  private lastThudAt = 0;

  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private overLayer: Phaser.GameObjects.Container | null = null;
  /** pooled contact-AO sprites stamped at fruit-vs-fruit touch points so
   *  resting contacts read soft instead of hard tangent circles */
  private contactPool: Phaser.GameObjects.Image[] = [];

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

    drawBackground(this);
    this.buildWalls();
    this.buildDangerLine();
    this.buildHud();
    this.buildEmitters();
    this.buildContactShadows();

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
      g.lineStyle(2, 0xe0b070, 0.85); // inner bevel light
      const bx = x === 0 ? x + t - 1.5 : x + 1.5;
      g.lineBetween(bx, 4, bx, F + t - 4);
      g.lineStyle(2, 0x5e3a18, 0.9); // outer dark edge
      const ox = x === 0 ? x + 1.5 : x + t - 1.5;
      g.lineBetween(ox, 4, ox, F + t - 4);
    }
    // floor planks: horizontal gradient + seams
    g.fillGradientStyle(0xb87f42, 0xb87f42, 0x7d5226, 0x7d5226, 1, 1, 1, 1);
    g.fillRect(0, F, GAME.width, H - F);
    g.lineStyle(1.5, 0x6e4520, 0.55);
    for (let x = 52; x < GAME.width; x += 62) g.lineBetween(x, F + 3, x, H - 3);
    g.lineStyle(2, 0xe0b070, 0.85);
    g.lineBetween(4, F + 1.5, GAME.width - 4, F + 1.5); // top bevel light
    g.fillStyle(0x5e3a18, 0.35); // soft contact shadow under the playfield
    g.fillRect(L, F - 6, R - L, 6);
    void L;
  }

  private buildDangerLine(): void {
    this.dangerGfx = this.add.graphics().setDepth(5);
    this.redrawDangerLine(0.45);
    this.add
      .text(GAME.width / 2, GAME.dangerLineY - 18, STR.dangerLine, {
        fontFamily: FONT_FAMILY, fontSize: '14px', color: '#fff3d9',
        stroke: '#a03010', strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(5);
  }

  private redrawDangerLine(alpha: number): void {
    // glowing ribbon: soft outer glow band + bright core line
    const g = this.dangerGfx;
    g.clear();
    const y = GAME.dangerLineY;
    const x0 = GAME.innerLeft + 4;
    const x1 = GAME.innerRight - 4;
    g.fillStyle(0xff5a36, 0.35 * alpha);
    g.fillRoundedRect(x0, y - 5, x1 - x0, 10, 5);
    g.lineStyle(3, 0xff3b1f, Math.min(1, alpha + 0.25));
    g.lineBetween(x0, y, x1, y);
    g.lineStyle(1.5, 0xffd9a8, Math.min(1, alpha + 0.35));
    g.lineBetween(x0, y - 1.5, x1, y - 1.5);
    g.setAlpha(1);
  }

  private buildHud(): void {
    this.add.text(16, 8, STR.score, {
      fontFamily: FONT_FAMILY, fontSize: '17px', color: '#7a4a20',
    });
    this.scoreText = this.add
      .text(16, 24, '0', {
        fontFamily: FONT_FAMILY, fontSize: '34px', color: '#fff8ea',
        stroke: '#7a4a20', strokeThickness: 6,
      });

    this.bestText = this.add.text(150, 32, `${STR.bestScore} ${this.best}`, {
      fontFamily: FONT_FAMILY, fontSize: '17px', color: '#fff3d9',
      stroke: '#7a4a20', strokeThickness: 4,
    });

    this.add.text(292, 8, STR.next, {
      fontFamily: FONT_FAMILY, fontSize: '17px', color: '#7a4a20',
    });
    this.nextImg = this.add.image(322, 46, 'fruit_01').setDisplaySize(38, 38);

    makeIconButton(this, 386, 24, STR.pauseIcon, () => this.togglePause());
    this.soundBtn = makeIconButton(this, 386, 58, sfx.isMuted() ? STR.soundOff : STR.soundOn, () => {
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
  }

  /** Pool of contact-AO sprites (depth 1.5: above blob shadows, below fruits).
   *  Allocation-free: 28 sprites created once, repositioned every frame. */
  private buildContactShadows(): void {
    for (let i = 0; i < 28; i++) {
      const s = this.add.image(-100, -100, 'contactAO');
      s.setDepth(1.5).setVisible(false);
      this.contactPool.push(s);
    }
  }

  /** Stamp a soft AO blob at every live fruit-vs-fruit contact point.
   *  Reads Matter's active pair list (no O(n^2) scan); the shadow sits in the
   *  crevice between the two circles with its long axis along the tangent,
   *  which kills the "hard tangent circles" look when fruits pile up. */
  private updateContactShadows(): void {
    let used = 0;
    const pool = this.contactPool;
    const pairs = (this.matter.world.engine.pairs?.list ?? []) as Array<{
      bodyA: { gameObject?: unknown };
      bodyB: { gameObject?: unknown };
      isActive?: boolean;
    }>;
    for (const pair of pairs) {
      if (used >= pool.length) break;
      if (pair.isActive === false) continue;
      const a = pair.bodyA.gameObject as FruitGO | undefined;
      const b = pair.bodyB.gameObject as FruitGO | undefined;
      if (!a?.active || !b?.active) continue;
      if (!a.getData('isFruit') || !b.getData('isFruit')) continue;
      if (a.getData('merging') || b.getData('merging')) continue;
      if (a.getData('popping') || b.getData('popping')) continue;
      const r1 = radiusForTier(a.getData('tier') as number);
      const r2 = radiusForTier(b.getData('tier') as number);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 0.01) continue;
      // contact point on the line between centers, weighted by visual radii
      const t = r1 / (r1 + r2);
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      const rm = Math.min(r1, r2);
      const s = pool[used++];
      s.setVisible(true);
      s.setPosition(px, py);
      s.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      s.setScale((rm * 1.15) / 64, (rm * 0.5) / 32);
    }
    for (let i = used; i < pool.length; i++) pool[i].setVisible(false);
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
    this.nextImg.setTexture(FRUITS[this.nextTier - 1].tex).setDisplaySize(38, 38);
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
        if (fruit.active) fruit.setScale(sx, sy);
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
    const fruit = createFruit(this, x, y, newTier, now);
    // "squeezed out" feel: a tiny upward hop on birth (popIn adds the scale pop)
    fruit.setVelocity(0, -1.8);
    this.fruits.push(fruit);
    this.enforceCap();
    this.maxTierReached = Math.max(this.maxTierReached, newTier);

    const color = FRUITS[newTier - 1].color;
    const gained = mergeScoreForTier(newTier);
    this.addScore(gained);
    this.floatText(x, y - radiusForTier(newTier) - 6, `+${gained}`, '#e67e22', 22);

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
    sfx.merge(newTier);
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
    // the blob shadow is a separate GameObject — destroy it with the fruit
    const sh = f.getData('shadow') as Phaser.GameObjects.Image | undefined;
    if (sh && sh.active) sh.destroy();
    // a chained merge can destroy a fruit while its pop tween is still
    // running — kill tweens first, otherwise the tween writes scale to a
    // dead Matter body and throws.
    this.tweens.killTweensOf(f);
    f.destroy();
  }

  // ---------------- juice ----------------

  private floatText(x: number, y: number, str: string, color: string, size: number): void {
    const t = this.add
      .text(x, y, str, {
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
    this.scoreText.setText(String(this.score));
    // juicy pop on every score change
    this.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1.25);
    this.tweens.add({
      targets: this.scoreText, scaleX: 1, scaleY: 1,
      duration: 160, ease: 'Back.easeOut',
    });
  }

  // ---------------- danger / game over ----------------

  private checkDanger(now: number): void {
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
          return;
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
    panel.fillStyle(0xfffdf4, 1);
    panel.fillRoundedRect(cx - 165, cy - 190, 330, 380, 18);
    panel.lineStyle(4, 0xe0a83e, 1);
    panel.strokeRoundedRect(cx - 165, cy - 190, 330, 380, 18);

    const title = this.add
      .text(cx, cy - 150, STR.gameOver, { fontSize: '34px', color: '#c0392b', fontStyle: 'bold' })
      .setOrigin(0.5);
    const recordTxt = isRecord
      ? this.add.text(cx, cy - 112, STR.newRecord, { fontSize: '18px', color: '#e67e22', fontStyle: 'bold' }).setOrigin(0.5)
      : null;
    const scoreTxt = this.add
      .text(cx, cy - 66, `${STR.yourScore}\n${this.score}`, {
        fontSize: '22px',
        color: '#4a2f12',
        align: 'center',
        fontStyle: 'bold',
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    const bestTxt = this.add
      .text(cx, cy + 2, `${STR.bestScore}：${this.best}`, { fontSize: '18px', color: '#7a5a2e' })
      .setOrigin(0.5);

    const topDef = FRUITS[this.maxTierReached - 1];
    const fruitImg = this.add.image(cx - 52, cy + 52, topDef.tex).setDisplaySize(44, 44);
    const fruitTxt = this.add
      .text(cx + 62, cy + 52, `${STR.highestFruit}\n${topDef.nameZh}`, {
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
    const title = this.add
      .text(cx, cy - 92, STR.paused, { fontSize: '30px', color: '#4a2f12', fontStyle: 'bold' })
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
    this.scoreText.setText('0');
    this.maxTierReached = 1;
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
      const y0 = GAME.aimY + r + 6;
      const y1 = GAME.floorTop - 8;
      this.aimGuide.fillStyle(0x4a7c2f, 0.55);
      for (let y = y0; y < y1; y += 14) {
        this.aimGuide.fillCircle(gx, y, 2.5);
      }
      // landing marker: pulsing ring where the fruit will land
      const pulse = 1 + Math.sin(time / 240) * 0.12;
      this.aimGuide.lineStyle(2.5, 0x4a7c2f, 0.65);
      this.aimGuide.strokeCircle(gx, y1, r * pulse);
    } else {
      this.aimGuide.clear();
    }

    this.processMerges();
    this.checkDanger(time);
    this.updateShadows();
    this.updateContactShadows();
  }

  /** Sync each fruit's blob shadow: glued under the fruit, shrinking and
   *  fading as the fruit rises — sells the 3D depth. Allocation-free. */
  private updateShadows(): void {
    for (const f of this.fruits) {
      if (!f.active) continue;
      const sh = f.getData('shadow') as Phaser.GameObjects.Image | undefined;
      if (!sh) continue;
      const r = radiusForTier(f.getData('tier') as number);
      const hFrac = Phaser.Math.Clamp((GAME.floorTop - f.y) / GAME.floorTop, 0, 1);
      sh.x = f.x;
      sh.y = f.y + r * (0.92 - 0.3 * hFrac);
      const s = 1 - 0.35 * hFrac;
      sh.setScale((f.getData('shSX') as number) * s, (f.getData('shSY') as number) * s);
      sh.setAlpha(0.3 * (1 - 0.45 * hFrac));
    }
  }
}
