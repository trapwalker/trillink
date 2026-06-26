import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'es2022',
  },
  // ggwave is a CJS module with inline WASM; exclude from SSR transforms
  ssr: {
    noExternal: ['ggwave'],
  },
});
