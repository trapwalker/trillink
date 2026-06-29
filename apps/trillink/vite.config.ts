import preact from '@preact/preset-vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';
import type { Plugin, UserConfig } from 'vite';
import { defineConfig } from 'vite';

function getAppVersion(): string {
  try {
    const sha  = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    return `${date}-${sha}`;
  } catch {
    return 'dev';
  }
}

function getLanIp(): string | null {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function listenLinkPlugin(base: string): Plugin {
  return {
    name: 'trillink-listen-link',
    configureServer(server) {
      server.httpServer?.once('listening', async () => {
        const addr = server.httpServer?.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        const lanIp  = getLanIp();
        const lanUrl = lanIp ? `https://${lanIp}:${port}${base}` : null;

        console.log(`\n  \x1b[36m▶◀ trillink:\x1b[0m \x1b[4mhttps://localhost:${port}${base}\x1b[0m`);
        if (lanUrl) {
          console.log(`  \x1b[36mNetwork:\x1b[0m        \x1b[4m${lanUrl}\x1b[0m`);
          console.log(`  \x1b[33m⚠ Self-signed cert — accept it in the browser on first visit\x1b[0m`);
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

export default defineConfig(({ command }): UserConfig => {
  const isServe = command === 'serve';
  // VITE_BASE is set by CI for GitHub Pages (/trillink/).
  // Locally it's always root (/), which avoids conflicts with HTTPS proxy.
  const base = process.env.VITE_BASE ?? '/';

  return {
    base,
    plugins: [
      ...(isServe ? [basicSsl()] : []),
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
          start_url: base,
          scope: base,
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
      listenLinkPlugin(base),
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
    define: {
      __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? getAppVersion()),
    },
    build: {
      target: 'es2022',
    },
    ssr: {
      noExternal: ['ggwave'],
    },
  };
});
