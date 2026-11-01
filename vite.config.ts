import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const sharedDir = fileURLToPath(new URL('./shared', import.meta.url));

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': sharedDir
    }
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        // Source files under client/api are served by Vite itself. Only true
        // API requests are forwarded to Express. Without this, /api/client.ts
        // would collide with the API namespace in development.
        bypass: (req) => {
          const path = req.url ?? '';
          return /\.(?:[cm]?[jt]sx?|css|map)(?:\?|$)/.test(path) ? path : undefined;
        }
      },
      '/healthz': { target: 'http://127.0.0.1:3000' },
      '/readyz': { target: 'http://127.0.0.1:3000' }
    }
  }
});
