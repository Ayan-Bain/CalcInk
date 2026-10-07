import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Cache static assets + ort-wasm
        globPatterns: ['**/*.{js,css,html,ico,svg,wasm,mjs}'],
        // Model files are large — use CacheFirst, max 1 entry each
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.onnx$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'calcink-models',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/models\/tokenizer\.json$/,
            handler: 'CacheFirst',
            options: { cacheName: 'calcink-models' },
          },
          {
            urlPattern: /\/ort-wasm\//,
            handler: 'CacheFirst',
            options: { cacheName: 'calcink-ort-wasm' },
          },
        ],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024, // 100 MB
      },
      manifest: {
        name: 'CalcInk',
        short_name: 'CalcInk',
        description: 'Handwritten arithmetic calculator — 100% client-side',
        theme_color: '#1a1a2e',
        background_color: '#f5f0e8',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
  },
} as any)
