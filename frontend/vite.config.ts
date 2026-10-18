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
    // Do not modulepreload heavy lazy-only chunks (mermaid, force-graph) on first paint.
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter(
          (dep) =>
            !dep.includes('mermaid') &&
            !dep.includes('force-graph') &&
            !dep.includes('graph-3d'),
        );
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Pin React first — otherwise Rollup may place it inside force-graph/mermaid
          // chunks and the entry bundle statically imports those (~3 MB on every page).
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/katex')) return 'katex';
          // Keep three + 3d-force-graph stack in one chunk — splitting three out causes
          // "Cannot access … before initialization" TDZ errors at runtime (Rollup cycle).
          if (
            id.includes('node_modules/three') ||
            id.includes('react-force-graph-3d') ||
            id.includes('3d-force-graph') ||
            id.includes('three-forcegraph') ||
            id.includes('three-render-objects')
          ) {
            return 'graph-3d';
          }
          // mermaid + 2d force-graph: leave to dynamic import() — no manual chunk.
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
