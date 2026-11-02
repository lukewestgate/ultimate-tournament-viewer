import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the site works from any sub-path (GitHub Pages project sites).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ultimate Tournament Viewer',
        short_name: 'Tournaments',
        description: 'Unofficial viewer for ultimate frisbee tournaments published as Google Sheets',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F3F4F1',
        theme_color: '#0E1A3A',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Precache the app shell; the xlsx parser chunk is cached once it's used.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/xlsx-*.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          // Google data and OpenRouter always go to the network (the app caches data itself).
          { urlPattern: /^https:\/\/docs\.google\.com\//, handler: 'NetworkOnly' },
          { urlPattern: /^https:\/\/openrouter\.ai\//, handler: 'NetworkOnly' },
          { urlPattern: /\/assets\/xlsx-.*\.js$/, handler: 'CacheFirst', options: { cacheName: 'lazy-chunks' } },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
