import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function listenLinkPlugin(): Plugin {
  return {
    name: 'trillink-listen-link',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        const url = `http://localhost:${port}`;
        console.log(`\n  \x1b[36m▶◀ trillink:\x1b[0m \x1b[4m${url}\x1b[0m\n`);
      });
    },
  };
}

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [preact(), listenLinkPlugin()],
  resolve: {
    // Point workspace packages to TypeScript source so Vite picks up changes
    // without a rebuild step.
    alias: {
      '@trillink/audio-web':     `${root}/packages/audio-web/src/index.ts`,
      '@trillink/protocol':      `${root}/packages/protocol/src/index.ts`,
      '@trillink/sdk':           `${root}/packages/sdk/src/index.ts`,
      '@trillink/coord-parser':  `${root}/packages/coord-parser/src/index.ts`,
      '@trillink/map-providers': `${root}/packages/map-providers/src/index.ts`,
    },
  },
  build: {
    target: 'es2022',
  },
  ssr: {
    noExternal: ['ggwave'],
  },
});
