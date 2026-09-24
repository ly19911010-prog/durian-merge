import Phaser from 'phaser';
import { GAME } from './config/gameConfig';
import { BootScene } from './game/scenes/BootScene';
import { StartScene } from './game/scenes/StartScene';
import { GameScene } from './game/scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME.width,
  height: GAME.height,
  parent: 'game-root',
  backgroundColor: '#fff3d6',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
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
