import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/main.ts')
      },
      outDir: 'out/main'
    }
  },
  preload: {
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.ts')
      },
      outDir: 'out/preload'
    }
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html')
      },
      outDir: 'out/renderer'
    }
  }
});
