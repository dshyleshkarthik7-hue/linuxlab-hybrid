import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
const entry = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const testIsoSources: Record<string, string> = {
  developer: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso',
  virt: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso',
  linux4: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso',
};

function testIsoProxy() {
  return {
    name: 'test-iso-proxy',
    configurePreviewServer(server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      if (process.env.REAL_GUEST_ISO_PROXY !== '1') return;
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
        if (requestUrl.pathname !== '/api/iso') return next();
        try {
          const image = requestUrl.searchParams.get('image') || 'developer';
          const upstream = testIsoSources[image] || testIsoSources.developer;
          const headers: Record<string, string> = {};
          for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
            const value = req.headers[name];
            if (value) headers[name] = Array.isArray(value) ? value[0] : value;
          }
          const response = await fetch(upstream, { headers, redirect: 'follow' });
          res.statusCode = response.status;
          for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
            const value = response.headers.get(name);
            if (value) res.setHeader(name, value);
          }
          if (response.body) Readable.fromWeb(response.body as globalThis.ReadableStream).pipe(res);
          else res.end();
        } catch (error) {
          if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
          res.end(`ISO proxy failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [testIsoProxy()],
  base: '/',
  server: { port: 3000, headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  preview: { port: 3000, headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  optimizeDeps: { include: ['@xterm/xterm', '@xterm/addon-fit', 'monaco-editor'] },
  build: {
    outDir: 'dist', target: 'esnext', cssMinify: false, chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: entry('index.html'), beginner: entry('beginner/index.html'), intermediate: entry('intermediate/index.html'), expert: entry('expert/index.html'),
        simulator: entry('simulator.html'), v86: entry('index-v86.html'), linux4: entry('linux4.html'), about: entry('about/index.html'), contact: entry('contact/index.html'),
        curriculum: entry('curriculum/index.html'), commands: entry('commands/index.html'), quiz: entry('quiz/index.html'), challenges: entry('challenges/index.html'),
        iso: entry('open-source-iso/index.html'),
      },
      output: { manualChunks(id) { if (id.includes('monaco-editor')) return 'monaco'; if (id.includes('@xterm')) return 'xterm'; } }
    }
  }
});
