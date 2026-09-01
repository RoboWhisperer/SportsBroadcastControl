/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// better-sqlite3, obs-websocket-js et al. must stay CommonJS-required at runtime,
// not bundled into the ESM main bundle.
const external = ['electron', 'express', 'ws', 'bonjour-service', 'obs-websocket-js']

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: { build: { rollupOptions: { external, output: { format: 'es', entryFileNames: '[name].js' } } } },
      },
      // Sandboxed preloads must be CommonJS, so this one is emitted as .cjs.
      preload: {
        input: 'electron/preload.ts',
        vite: { build: { rollupOptions: { external: ['electron'], output: { format: 'cjs', entryFileNames: '[name].cjs' } } } },
      },
    }),
  ],
  build: { outDir: 'dist' },
  test: { environment: 'node', globals: true, include: ['tests/**/*.test.ts'] },
})
