import { createReadStream, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const ortWasmModuleFiles = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jspi.mjs',
  'ort-wasm-simd-threaded.asyncify.mjs',
]

// In dev, Vite intercepts all dynamic import() calls via its plugin pipeline
// and refuses to serve files from /public as ES modules.  This middleware runs
// BEFORE Vite's transform pipeline and serves the ORT .mjs glue scripts directly
// from node_modules, so Vite never gets a chance to block them.
const ortWasmDevMiddleware = {
  name: 'ort-wasm-dev',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const url: string = (req.url ?? '').split('?')[0]
      if (url.startsWith('/ort-wasm/') && url.endsWith('.mjs')) {
        const fileName = url.slice('/ort-wasm/'.length)
        const filePath = resolve(__dirname, 'node_modules/onnxruntime-web/dist', fileName)
        res.setHeader('Content-Type', 'text/javascript')
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(filePath)
          .on('error', () => next())
          .pipe(res)
        return
      }
      next()
    })
  },
}

const ortWasmBuildAssets: Plugin = {
  name: 'ort-wasm-build-assets',
  apply: 'build',
  generateBundle() {
    for (const fileName of ortWasmModuleFiles) {
      this.emitFile({
        type: 'asset',
        fileName: `ort-wasm/${fileName}`,
        source: readFileSync(resolve(__dirname, 'node_modules/onnxruntime-web/dist', fileName)),
      })
    }
  },
}

export default defineConfig({
  server: {
    headers: {
      // Required for SharedArrayBuffer (ORT WASM multi-threading).
      // With numThreads=1 in the worker this isn't strictly needed today,
      // but setting it here means we can re-enable threading later without
      // server config changes, and it's correct for production too.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    ortWasmDevMiddleware,
    ortWasmBuildAssets,
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
