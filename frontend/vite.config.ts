/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function gitShortHash(): string {
  try {
    return execSync('git rev-parse --short=6 HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

/** Baked into the bundle at build/dev start; never written to source files. */
function resolveAppVersion(): string {
  const fromEnv = process.env.VITE_APP_VERSION?.trim()
  if (fromEnv) return fromEnv.slice(0, 6)
  return gitShortHash() || 'dev'
}

process.env.VITE_APP_VERSION = resolveAppVersion()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/mermaid')) return 'mermaid';
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/katex')) return 'katex';
          if (id.includes('force-graph') || id.includes('d3-force') || id.includes('d3-quadtree')) {
            return 'force-graph';
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8102',
        changeOrigin: true,
      },
      '/internal-api': {
        target: 'http://localhost:8102',
        changeOrigin: true,
      },
      '/sync-session': { target: 'http://localhost:8102', changeOrigin: true },
      '/clear-session': { target: 'http://localhost:8102', changeOrigin: true },
      '/buckets/openkms': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/buckets\/openkms/, '/openkms'),
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req) => {
            // Object storage (MinIO, etc.) returns Access-Control-Allow-Origin: * which fails with credentials.
            // Replace with request origin so credentialed CORS requests succeed.
            const origin = req.headers.origin || 'http://localhost:5173';
            proxyRes.headers['access-control-allow-origin'] = origin;
            proxyRes.headers['access-control-allow-credentials'] = 'true';
          });
        },
      },
    },
  },
})
