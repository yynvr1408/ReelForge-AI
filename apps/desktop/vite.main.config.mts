import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // ffmpeg-ffprobe-static must stay a real `require()` call rather
      // than being bundled, since it resolves binary paths relative to
      // its own location in node_modules at runtime — but only in dev
      // mode (packaged mode never calls it; see src/main/paths.ts).
      // Everything else, including electron-squirrel-startup, must be
      // bundled: the packaged app's asar ships main.cjs/preload.cjs
      // only, not node_modules, so an external `require()` to any
      // other package fails at runtime with "Cannot find module".
      external: ['ffmpeg-ffprobe-static'],
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
