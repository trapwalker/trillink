import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function listenLinkPlugin(): Plugin {
  return {
    name: 'trillink-listen-link',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        const url = `http://localhost:${port}/#listen`;
        console.log(`\n  \x1b[36m▶◀ trillink receive:\x1b[0m \x1b[4m${url}\x1b[0m\n`);
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), listenLinkPlugin()],
  build: {
    target: 'es2022',
  },
  // ggwave is a CJS module with inline WASM; exclude from SSR transforms
  ssr: {
    noExternal: ['ggwave'],
  },
});
