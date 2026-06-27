import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Trillink',
        short_name: 'Trillink',
        description: 'Transmit structured messages over any voice channel',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm}'],
        runtimeCaching: [
          {
            // Leaflet CDN CSS
            urlPattern: /^https:\/\/unpkg\.com\/leaflet/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'leaflet-cdn',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
    listenLinkPlugin(),
  ],
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
