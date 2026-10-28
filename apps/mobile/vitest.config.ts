import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests cover src/core only: plain TypeScript, no Expo or React Native.
export default defineConfig({
  resolve: {
    alias: { '@smilesync/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)) },
  },
  test: { include: ['src/core/**/*.test.ts'], environment: 'node' },
});
