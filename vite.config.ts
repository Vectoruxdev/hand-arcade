import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// One page, one bundle for the hub; each game under games/<id>/index.ts becomes its own lazy
// chunk through the registry's import.meta.glob. The PWA plugin (plan 5.2) precaches the app
// shell, the fonts, the hand model and the SIMD WASM so the arcade works with the cable pulled.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 4800, strictPort: true },
  preview: { port: 4800, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/apple-touch-icon.png', 'models/hand_landmarker.task', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm'],
      manifest: {
        name: 'Hand Games Arcade',
        short_name: 'Arcade',
        description: 'A full-screen family arcade you run entirely with your hands.',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#16213a',
        theme_color: '#16213a',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,jpg,png,svg,task,wasm}'],
        // The non-SIMD and module WASM variants are fallbacks for old browsers; served, not precached.
        globIgnores: ['**/wasm/vision_wasm_nosimd_*', '**/wasm/vision_wasm_module_*'],
        maximumFileSizeToCacheInBytes: 24 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
