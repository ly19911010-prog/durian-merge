import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths — keeps the build portable (web + future Telegram WebApp)
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
