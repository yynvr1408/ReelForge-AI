import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Native/path-resolving packages must stay as real `require()`
      // calls rather than being bundled, since they depend on
      // `__dirname`/`node_modules` layout at runtime.
      external: ['ffmpeg-ffprobe-static', 'electron-squirrel-startup'],
      output: {
        // The entry is src/main/index.ts, so Vite's default lib naming
        // would emit index.cjs here AND for the preload entry (also
        // index.ts), clobbering one another in the shared
        // .vite/build/ output directory. Force distinct, stable names
        // that match package.json's "main" field and the preload path
        // referenced from src/main/index.ts.
        entryFileNames: 'main.cjs',
      },
    },
  },
});
