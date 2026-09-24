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
  // Render the canvas backing store at device pixel ratio so fruit art stays
  // crisp on retina / high-DPI screens (the 420x740 logical canvas is CSS-scaled
  // by Phaser.Scale.FIT; without zoom the backing store is 1x and looks blurry).
  // Game logic keeps using 420x740 coordinates; only the raster is denser.
  // zoom caps at 3: a tier-10 fruit displays at ~118px logical → ~355px raster,
  // still under the 512px texture, so no upscaling blur.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: Math.min(window.devicePixelRatio || 1, 3),
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

  // Diagnostic handle for automated smoke tests (used by CI-style harnesses
  // to read scene state); harmless in production.
  (window as unknown as { __durian?: Phaser.Game }).__durian = game;
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
