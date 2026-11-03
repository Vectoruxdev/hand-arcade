import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// One page, one bundle for the hub; each game under games/<id>/index.ts becomes its own
// lazy chunk through the registry's import.meta.glob (Phase 2.1).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 4800, strictPort: true },
  preview: { port: 4800, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
