import Phaser from 'phaser';
import { GAME } from './config/gameConfig';
import { BootScene } from './game/scenes/BootScene';
import { StartScene } from './game/scenes/StartScene';
import { GameScene } from './game/scenes/GameScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME.width,
  height: GAME.height,
  parent: 'game-root',
  backgroundColor: '#fff3d6',
  // Render the canvas backing store at device pixel ratio so fruit art stays
  // crisp on retina / high-DPI screens (the 420x740 logical canvas is CSS-scaled
  // by Phaser.Scale.FIT; without zoom the backing store is 1x and looks blurry).
  // Game logic keeps using 420x740 coordinates; only the raster is denser.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: Math.min(window.devicePixelRatio || 1, 2),
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
