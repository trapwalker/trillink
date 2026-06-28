import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function getLanIp(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function listenLinkPlugin(): Plugin {
  return {
    name: 'trillink-listen-link',
    configureServer(server) {
      server.httpServer?.once('listening', async () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        const lanIp  = getLanIp();
        const lanUrl = lanIp ? `http://${lanIp}:${port}` : null;

        console.log(`\n  \x1b[36m▶◀ trillink:\x1b[0m \x1b[4mhttp://localhost:${port}\x1b[0m`);
        if (lanUrl) {
          console.log(`  \x1b[36mNetwork:\x1b[0m        \x1b[4m${lanUrl}\x1b[0m`);
          try {
            const { default: QRCode } = await import('qrcode') as { default: typeof import('qrcode') };
            const qr = await QRCode.toString(lanUrl, { type: 'terminal', small: true, errorCorrectionLevel: 'L' });
            console.log(qr);
          } catch { /* qrcode unavailable */ }
        }
        console.log();
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
