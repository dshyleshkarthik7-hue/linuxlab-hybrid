import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const entry = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));
export default defineConfig({
  plugins: [], base: '/',
  server: { port: 3000, headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  preview: { port: 3000, headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  optimizeDeps: { include: ['@xterm/xterm','@xterm/addon-fit','monaco-editor'] },
  build: { outDir:'dist', target:'esnext', cssMinify:'esbuild', chunkSizeWarningLimit:1000,
    rollupOptions:{ input:{ main:entry('index.html'), beginner:entry('beginner/index.html'), intermediate:entry('intermediate/index.html'), expert:entry('expert/index.html'), simulator:entry('simulator.html'), v86:entry('index-v86.html') }, output:{ manualChunks(id){ if(id.includes('monaco-editor')) return 'monaco'; if(id.includes('@xterm')) return 'xterm'; } } }
  }
});
