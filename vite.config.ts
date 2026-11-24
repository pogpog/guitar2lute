import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// `npm run preview:https` serves the build over HTTPS (needed to install the app on a phone) with a
// key and certificate from this directory; see README "Install on a phone".
const httpsDir = process.env.PREVIEW_HTTPS_DIR;
const https = httpsDir
  ? { key: readFileSync(join(httpsDir, 'server.key')), cert: readFileSync(join(httpsDir, 'server.crt')) }
  : undefined;
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Guitar to Lute',
        short_name: 'Guitar→Lute',
        description: 'Convert guitar chord boxes and tab to lute tablature',
        theme_color: '#6b4423',
        background_color: '#fbf7ef',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,svg,woff2}'],
      },
    }),
  ],
  preview: { https },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
