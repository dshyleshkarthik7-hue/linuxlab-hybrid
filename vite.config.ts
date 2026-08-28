import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (name: string) =>
  fileURLToPath(new URL(`./${name}`, import.meta.url));

export default defineConfig({
  base: './',
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    port: 3000,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    include: ['@xterm/xterm', '@xterm/addon-fit', 'monaco-editor'],
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: entry('index.html'),
        simulator: entry('simulator.html'),
        v86: entry('index-v86.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor')) return 'monaco';
          if (id.includes('@xterm')) return 'xterm';
        },
      },
    },
  },
});
