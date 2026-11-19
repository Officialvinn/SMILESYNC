import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Development only: send /api to the local stack behind Caddy. In docker,
  // Caddy serves the built files and the API on the same origin.
  server: {
    port: 5173,
    proxy: { '/api': { target: 'https://localhost', changeOrigin: true, secure: false } },
  },
  build: { outDir: 'dist', sourcemap: false },
});
