import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Sentry release: version plus the commit when built in CI (GitHub Actions sets GITHUB_SHA).
const release = `tournament-viewer@${pkg.version}+${process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'}`;

// Upload source maps to Sentry only when a token is present (the SENTRY_AUTH_TOKEN secret in CI).
// The maps are deleted after upload, so they are never published or precached.
const uploadMaps = Boolean(process.env.SENTRY_AUTH_TOKEN);

export default defineConfig({
  define: { __APP_RELEASE__: JSON.stringify(release) },
  // Relative base so the site works from any sub-path (GitHub Pages project sites).
  base: './',
  plugins: [
    react(),
    // Cookieless usage stats (Cloudflare Web Analytics), production builds only so dev visits aren't counted.
    {
      name: 'cloudflare-web-analytics',
      apply: 'build',
      transformIndexHtml: () => [
        {
          tag: 'script',
          attrs: {
            defer: true,
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': '{"token": "00a7c5eb26e64af1886a88787aea165e"}',
          },
          injectTo: 'body',
        },
      ],
    },
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
    uploadMaps &&
      sentryVitePlugin({
        org: 'luke-westgate',
        project: 'tournament-viewer',
        url: 'https://de.sentry.io/',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: release },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
      }),
  ],
  build: {
    target: 'es2022',
    sourcemap: uploadMaps ? 'hidden' : false,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
