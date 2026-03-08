import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
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
