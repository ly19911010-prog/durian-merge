import Phaser from 'phaser';
import { GAME } from './config/gameConfig';
import { BootScene } from './game/scenes/BootScene';
import { StartScene } from './game/scenes/StartScene';
import { GameScene } from './game/scenes/GameScene';

function createGame(): void {
  const game = new Phaser.Game({
  type: Phaser.WEBGL,
  width: GAME.width,
  height: GAME.height,
  parent: 'game-root',
  backgroundColor: '#fff3d6',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false, // sub-pixel motion reads smoother on phones
    powerPreference: 'high-performance',
  },
  fps: {
    target: 60,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: GAME.physics.gravityY },
      debug: false,
    },
  },
  scene: [BootScene, StartScene, GameScene],
  });

  enableRetinaRendering(game);

  // Diagnostic handle for automated smoke tests (used by CI-style harnesses
  // to read scene state); harmless in production.
  (window as unknown as { __durian?: Phaser.Game }).__durian = game;
}

/**
 * Render at devicePixelRatio (capped at 3) instead of 1x.
 *
 * Why: Phaser's ScaleManager always sizes the canvas backing store at the
 * game size (420x740) — the `zoom` scale-config only affects CSS, never the
 * backing store (verified in Phaser 3.90 source: setGameSize / updateScale
 * FIT branch). On a dpr=3 phone the browser upscales the whole frame ~3x,
 * so every version looked pixelated no matter the art.
 *
 * How (game logic and cameras keep 420x740 coordinates; only the raster is
 * denser — input mapping is untouched):
 *  - canvas.width/height = game size x DPR            (backing store)
 *  - renderer.resize(W*DPR, H*DPR): GL viewport + scissor cover the full
 *    buffer, then setProjectionMatrix(W, H) keeps the ortho projection in
 *    game units so cameras map 1:1 as before
 *  - each camera viewport = full buffer, otherwise its per-camera scissor
 *    clips rendering to the old 420x740 corner
 *
 * Re-applied on ScaleManager RESIZE (orientation changes reset
 * canvas.width) and on every scene CREATE (cameras are per-scene). The RESIZE
 * re-apply is deferred a frame so it runs after the renderer's own onResize,
 * which would otherwise reset the backing store back to the base size.
 */
function enableRetinaRendering(game: Phaser.Game): void {
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  if (DPR <= 1) return;

  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;

  const apply = () => {
    const w = Math.round(GAME.width * DPR);
    const h = Math.round(GAME.height * DPR);
    const canvas = game.canvas as HTMLCanvasElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    renderer.resize(w, h);
    // keep the projection in game units; the viewport already covers the
    // denser buffer, so the world maps 1:1 onto DPR pixels
    renderer.setProjectionMatrix(GAME.width, GAME.height);
    for (const scene of game.scene.getScenes(true)) {
      for (const cam of scene.cameras.cameras) {
        cam.setViewport(0, 0, w, h);
      }
    }
  };

  game.events.once(Phaser.Core.Events.READY, () => {
    apply();
    // Re-apply on EVERY scene create, not just the first: scene.start() /
    // scene.restart() recreate the cameras with default 420x740 viewports,
    // which would clip rendering into the corner of the 3x buffer
    // (caught by headless test: game-over -> home -> play again).
    for (const s of game.scene.scenes) {
      s.events.on(Phaser.Scenes.Events.CREATE, apply);
    }
  });
  game.scale.on(Phaser.Scale.Events.RESIZE, () => {
    // Defer to the next frame so this runs after Phaser's own RESIZE
    // listeners — notably the renderer's onResize, which resets the backing
    // store to the base size and would otherwise undo the upscale below.
    requestAnimationFrame(apply);
  });
}

// Wait for the display font (ZCOOL KuaiLe) before booting so canvas text
// renders in it on first paint; 2.5s cap keeps offline loads working.
async function boot(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load('20px "ZCOOL KuaiLe"'),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* offline or blocked fonts: fall back silently */
  }
  createGame();
}

void boot();
