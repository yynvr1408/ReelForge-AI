import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // See vite.main.config.mts for why this must be pinned explicitly.
      output: {
        entryFileNames: 'preload.cjs',
      },
    },
  },
});
