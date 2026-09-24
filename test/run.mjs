/**
 * Unit tests for the pure game logic (no Phaser needed).
 * Compiles src/utils/gameLogic.ts + src/config/gameConfig.ts with the
 * project's tsc into /tmp, then runs assertions against the output.
 *
 * Run: npm test
 */
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = mkdtempSync(path.join(tmpdir(), 'durian-test-'));

execSync(
  `npx tsc src/utils/gameLogic.ts src/config/gameConfig.ts ` +
    `--outDir ${outDir} --module commonjs --target es2020 ` +
    `--moduleResolution node --skipLibCheck --strict`,
  { cwd: root, stdio: 'pipe' },
);

const logic = await import(path.join(outDir, 'utils', 'gameLogic.js'));
const cfg = await import(path.join(outDir, 'config', 'gameConfig.js'));

let passed = 0;
function ok(cond, name) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    passed++;
    console.log(`ok: ${name}`);
  }
}
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// --- radius: monotonic, tier1 = 32 * 0.55 ---
ok(approx(logic.radiusForTier(1), 17.6), 'radius tier1 = 17.6');
let mono = true;
for (let t = 2; t <= 10; t++) if (!(logic.radiusForTier(t) > logic.radiusForTier(t - 1))) mono = false;
ok(mono, 'radius strictly increasing 1..10');
ok(approx(logic.radiusForTier(10), 32 * 1.48), 'radius tier10 = 47.36');
// body slightly smaller than visual so touching fruits have no visible gap
ok(approx(cfg.GAME.bodyRadiusFactor, 0.92), 'body radius factor = 0.92');
// biggest spawnable fruit (tier4) fits the 392px-wide container with margin
ok(logic.radiusForTier(4) * 2 < cfg.GAME.innerRight - cfg.GAME.innerLeft, 'tier4 diameter < container width');
// physics "fruit feel": gentle bounce, medium friction, uniform density
ok(approx(cfg.GAME.physics.restitution, 0.25), 'restitution = 0.25');
ok(approx(cfg.GAME.physics.friction, 0.4), 'friction = 0.4');
ok(approx(cfg.GAME.physics.frictionStatic, 0.8), 'frictionStatic = 0.8');

// --- spawn weights [42,32,20,6] -> boundaries ---
const pick = (r) => logic.pickSpawnTier(() => r);
ok(pick(0) === 1, 'spawn r=0 -> tier1');
ok(pick(0.419) === 1, 'spawn r=0.419 -> tier1');
ok(pick(0.42) === 2, 'spawn r=0.42 -> tier2');
ok(pick(0.739) === 2, 'spawn r=0.739 -> tier2');
ok(pick(0.74) === 3, 'spawn r=0.74 -> tier3');
ok(pick(0.939) === 3, 'spawn r=0.939 -> tier3');
ok(pick(0.94) === 4, 'spawn r=0.94 -> tier4');
ok(pick(0.9999) === 4, 'spawn r=0.9999 -> tier4');
// never spawns tier >= 5
let maxSeen = 0;
for (let i = 0; i < 5000; i++) maxSeen = Math.max(maxSeen, logic.pickSpawnTier(Math.random));
ok(maxSeen <= 4, 'spawn never >= tier5 (5000 rolls)');

// --- merge scores ---
const expected = [10, 20, 40, 80, 150, 250, 400, 650, 1000, 1600];
ok(expected.every((s, i) => logic.mergeScoreForTier(i + 1) === s), 'merge score table 1..10');
ok(logic.mergeScoreForTier(0) === 0 && logic.mergeScoreForTier(11) === 0, 'merge score invalid tier -> 0');

// --- merge resolution ---
const m33 = logic.resolveMerge(3, 3);
ok(m33.kind === 'merge' && m33.newTier === 4, 'merge 3+3 -> tier4');
const m11 = logic.resolveMerge(1, 1);
ok(m11.kind === 'merge' && m11.newTier === 2, 'merge 1+1 -> tier2');
const m99 = logic.resolveMerge(9, 9);
ok(m99.kind === 'merge' && m99.newTier === 10, 'merge 9+9 -> tier10 (durian)');
const b1010 = logic.resolveMerge(10, 10);
ok(b1010.kind === 'burst', 'merge 10+10 -> durian burst');
ok(logic.resolveMerge(2, 3).kind === 'none', 'merge 2+3 -> none');
ok(logic.resolveMerge(0, 0).kind === 'none', 'merge invalid -> none');

// --- drop clamp ---
ok(approx(logic.clampDropX(0, 13.2), cfg.GAME.innerLeft + 13.2), 'clamp left edge');
ok(approx(logic.clampDropX(999, 20), cfg.GAME.innerRight - 20), 'clamp right edge');
ok(approx(logic.clampDropX(210, 15), 210), 'clamp middle unchanged');

// --- danger line ---
ok(logic.isAboveDangerLine(cfg.GAME.dangerLineY - 1) === true, 'above line detected');
ok(logic.isAboveDangerLine(cfg.GAME.dangerLineY) === false, 'on line not above');
ok(logic.dangerTimeExceeded(0, 1999) === false, 'danger 1999ms not exceeded');
ok(logic.dangerTimeExceeded(0, 2000) === true, 'danger 2000ms exceeded');

// --- config sanity ---
ok(cfg.FRUITS.length === 10, '10 fruit tiers');
ok(cfg.FRUITS[0].nameZh === '龙眼' && cfg.FRUITS[9].nameZh === '榴莲', 'tier names zh');
ok(cfg.GAME.spawnTiers.every((t) => t <= 4), 'spawn pool tiers <= 4');
ok(cfg.GAME.burst.bonusScore === 3000 && cfg.GAME.burst.radius === 170, 'burst params');

console.log(`\n${passed} assertions passed${process.exitCode ? ' (WITH FAILURES)' : ''}`);
