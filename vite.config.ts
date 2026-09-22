import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import manifest from './artifacts/manifest.json' with { type: 'json' };

const entry = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const testIsoSources: Record<string, string> = Object.fromEntries(
  manifest.artifacts.filter((artifact) => artifact.image).map((artifact) => [artifact.image, artifact.url]),
);

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
    }
  };
}

export default defineConfig({
  plugins: [testIsoProxy()],
  base: '/',
  server: { port: 3000, headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  preview: { port: 3000, headers: { 'Cross-Origin-Opener-Policy': 'same-origin' } },
  optimizeDeps: { include: ['@xterm/xterm', '@xterm/addon-fit', 'monaco-editor'] },
  build: {
    outDir: 'dist',
    target: 'es2022',
    cssMinify: true,
    chunkSizeWarningLimit: 500,
    modulePreload: { resolveDependencies(filename, deps) { if (filename.includes('simulator')) return deps.filter(dep => !/(^|\/)monaco(?:-[^/]+)?\.js(?:\?.*)?$/.test(dep)); return deps; } },
    rollupOptions: {
      input: {
        main: entry('index.html'), beginner: entry('beginner/index.html'), intermediate: entry('intermediate/index.html'), expert: entry('expert/index.html'),
        simulator: entry('simulator.html'), v86: entry('index-v86.html'), developerAlpine: entry('developer-alpine/index.html'), linux4: entry('linux4.html'),
        about: entry('about/index.html'), contact: entry('contact/index.html'), curriculum: entry('curriculum/index.html'), commandsBuild: entry('commands-entry.html'),
        quiz: entry('quiz/index.html'), challenges: entry('challenges/index.html'), iso: entry('open-source-iso/index.html'),
        login: entry('login/index.html'), certificate: entry('certificate/index.html'), verify: entry('verify/index.html'), progress: entry('progress/index.html'),
        learn: entry('learn/index.html'), learnLinuxBasics: entry('learn/linux-basics/index.html'), learnTerminalNavigation: entry('learn/terminal-navigation/index.html'),
        learnFiles: entry('learn/files-and-directories/index.html'), learnText: entry('learn/text-processing/index.html'), learnPermissions: entry('learn/permissions/index.html'),
        learnProcesses: entry('learn/processes/index.html'), learnShell: entry('learn/shell-scripting/index.html')
      },
      output: {
        manualChunks(id) { if (id.includes('monaco-editor')) return 'monaco'; if (id.includes('@xterm')) return 'xterm'; }
      }
    }
  }
});
